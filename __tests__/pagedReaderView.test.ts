import React from 'react';
import {Text} from 'react-native';
import {
  derivePagedReaderBehavior,
  type PagedReaderBehavior,
} from '../src/app/PagedReaderBehavior';
import {
  commitPaginationMeasurement,
  createPagedReaderState,
  planPaginationMeasurement,
  updatePagedReaderGeometry,
  type PaginationMeasurementRequest,
  type PagedReaderState,
} from '../src/app/PagedReaderPagination';
import {
  getPagedReaderTextWidth,
  PagedReaderView,
  READER_TEXT_HORIZONTAL_INSET,
} from '../src/app/PagedReaderView';
import {resolveReaderPalette} from '../src/app/ReaderTheme';

const palette = resolveReaderPalette('light', false);

function createCommittedState(): PagedReaderState {
  const passages = Array.from(
    {length: 18},
    (_, index) => `Компонентная строка ${index + 1}.`,
  );
  let state = updatePagedReaderGeometry(createPagedReaderState(), {
    width: 360,
    height: 180,
    fontScale: 1,
  });
  const request = planPaginationMeasurement(state, passages);
  if (!request) {
    throw new Error('Expected pagination request.');
  }

  state = commitPaginationMeasurement(
    state,
    request,
    request.text.split('\n'),
  );
  return state;
}

function createBehavior(
  state: PagedReaderState,
  interactionRequested = false,
): PagedReaderBehavior {
  return derivePagedReaderBehavior({
    state,
    passageCount: state.processedPassageCount,
    paginationPending: false,
    interactionRequested,
    interactionTargetPassageCount: null,
    hasInteraction: true,
    bannerReadyHeight: 0,
    bannerEligible: true,
  });
}

function visit(
  node: React.ReactNode,
  visitor: (element: React.ReactElement<Record<string, unknown>>) => void,
): void {
  if (Array.isArray(node)) {
    node.forEach(child => visit(child, visitor));
    return;
  }

  if (!React.isValidElement(node)) {
    return;
  }

  const element = node as React.ReactElement<Record<string, unknown>>;
  visitor(element);
  visit(element.props.children as React.ReactNode, visitor);
}

function textContent(node: React.ReactNode): string {
  let result = '';

  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textContent).join('');
  }
  if (React.isValidElement(node)) {
    const element = node as React.ReactElement<Record<string, unknown>>;
    result += textContent(element.props.children as React.ReactNode);
  }

  return result;
}

function findHandler(
  node: React.ReactNode,
  prop: string,
): ((event: unknown) => void) | null {
  let handler: ((event: unknown) => void) | null = null;
  visit(node, element => {
    if (handler) {
      return;
    }
    const candidate = element.props[prop];
    if (typeof candidate === 'function') {
      handler = candidate as (event: unknown) => void;
    }
  });
  return handler;
}

function renderView(
  behavior: PagedReaderBehavior,
  options: Readonly<{
    paginationRequest?: PaginationMeasurementRequest | null;
    interactionContent?: React.ReactNode;
    onMeasurement?: jest.Mock;
    onPageLayout?: jest.Mock;
  }> = {},
): React.JSX.Element {
  return PagedReaderView({
    behavior,
    paginationRequest: options.paginationRequest ?? null,
    palette,
    busy: false,
    interactionContent:
      options.interactionContent ?? React.createElement(Text, null, 'Выбор'),
    onMeasurement: options.onMeasurement ?? jest.fn(),
    onPageLayout: options.onPageLayout ?? jest.fn(),
    onPrevious: jest.fn(),
    onNext: jest.fn(),
    onCloseInteraction: jest.fn(),
  });
}

describe('PagedReaderView component contract', () => {
  test('renders the committed physical page and its one-based number', () => {
    const state = createCommittedState();
    const behavior = createBehavior(state);
    const tree = renderView(behavior);
    const renderedText = textContent(tree);

    expect(renderedText).toContain(
      behavior.currentPage?.paragraphs.join('\n') ?? '',
    );
    expect(renderedText).toContain(String(behavior.displayedPageNumber));
    expect(renderedText).not.toContain('Выбор');
  });

  test('interaction screen can contain multiline choices without rendering page text or number', () => {
    const state = createCommittedState();
    const lastState = {
      ...state,
      currentPageIndex: state.pages.length - 1,
    };
    const behavior = createBehavior(lastState, true);
    const longChoice =
      'Пойти через длинный тёмный коридор, где описание выбора переносится ' +
      'на несколько строк\nи остаётся частью отдельного interaction screen.';
    const tree = renderView(
      behavior,
      {interactionContent: React.createElement(Text, null, longChoice)},
    );
    const renderedText = textContent(tree);

    expect(behavior.interactionVisible).toBe(true);
    expect(renderedText).toContain(longChoice);
    expect(renderedText).not.toContain(
      behavior.currentPage?.paragraphs.join('\n') ?? '',
    );
    expect(behavior.displayedPageNumber).toBeNull();
  });

  test('forwards native text measurement as data instead of owning pagination', () => {
    const state = updatePagedReaderGeometry(createPagedReaderState(), {
      width: 360,
      height: 180,
      fontScale: 1,
    });
    const source = ['Первая строка.', 'Вторая строка.'];
    const request = planPaginationMeasurement(state, source);
    if (!request) {
      throw new Error('Expected pagination request.');
    }

    const behavior = derivePagedReaderBehavior({
      state,
      passageCount: source.length,
      paginationPending: true,
      interactionRequested: false,
      interactionTargetPassageCount: null,
      hasInteraction: false,
      bannerReadyHeight: 0,
      bannerEligible: false,
    });
    const onMeasurement = jest.fn();
    const tree = renderView(behavior, {
      paginationRequest: request,
      onMeasurement,
    });
    const onTextLayout = findHandler(tree, 'onTextLayout');
    if (!onTextLayout) {
      throw new Error('Expected measurement Text callback.');
    }

    onTextLayout({
      nativeEvent: {
        lines: [
          {text: 'Первая строка.', height: 27},
          {text: 'Вторая строка.', height: 31},
        ],
      },
    });

    expect(onMeasurement).toHaveBeenCalledWith(
      request,
      ['Первая строка.', 'Вторая строка.'],
      31,
    );
  });

  test('keeps pagination width inside the clipped reader bounds', () => {
    expect(READER_TEXT_HORIZONTAL_INSET).toBeGreaterThan(0);
    expect(getPagedReaderTextWidth(360)).toBe(
      360 - READER_TEXT_HORIZONTAL_INSET * 2,
    );
    expect(getPagedReaderTextWidth(READER_TEXT_HORIZONTAL_INSET)).toBe(0);
  });

  test('reports drawable text layout without mutating reader state', () => {
    const state = createCommittedState();
    const behavior = createBehavior(state);
    const onPageLayout = jest.fn();
    const tree = renderView(behavior, {onPageLayout});
    const onLayout = findHandler(tree, 'onLayout');
    if (!onLayout) {
      throw new Error('Expected page layout callback.');
    }

    onLayout({nativeEvent: {layout: {width: 360, height: 180}}});

    expect(onPageLayout).toHaveBeenCalledWith(
      360 - READER_TEXT_HORIZONTAL_INSET * 2,
      180,
    );
    expect(state.pages[0]).toBe(behavior.currentPage);
  });
});
