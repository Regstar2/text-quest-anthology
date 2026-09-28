import {
  committedPageBodyHeight,
  derivePagedReaderBehavior,
  resolvePagedReaderForwardAction,
} from '../src/app/PagedReaderBehavior';
import {
  commitPaginationMeasurement,
  createPagedReaderState,
  movePagedReaderToPage,
  planPaginationMeasurement,
  updatePagedReaderGeometry,
  type PagedReaderState,
} from '../src/app/PagedReaderPagination';

const BASE_GEOMETRY = {width: 360, height: 180, fontScale: 1};

function passages(count: number): string[] {
  return Array.from({length: count}, (_, index) => `Абзац ${index + 1}.`);
}

function paginate(
  source: readonly string[],
  options: Readonly<{
    fontScale?: number;
    bannerReserve?: number;
    pagesPerBanner?: number;
  }> = {},
): PagedReaderState {
  let state = updatePagedReaderGeometry(createPagedReaderState(), {
    ...BASE_GEOMETRY,
    fontScale: options.fontScale ?? 1,
  });
  const request = planPaginationMeasurement(
    state,
    source,
    options.bannerReserve ?? 0,
    options.pagesPerBanner ?? 0,
  );
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

function behavior(
  state: PagedReaderState,
  overrides: Partial<Parameters<typeof derivePagedReaderBehavior>[0]> = {},
) {
  return derivePagedReaderBehavior({
    state,
    passageCount: state.processedPassageCount,
    paginationPending: false,
    interactionRequested: false,
    interactionTargetPassageCount: null,
    hasInteraction: true,
    bannerReadyHeight: 0,
    bannerEligible: true,
    ...overrides,
  });
}

describe('paged reader behavioral regressions', () => {
  test('1 -> 2 -> 3 -> 4 and back keeps canonical numbers and page text', () => {
    const initial = paginate(passages(24));
    expect(initial.pages.length).toBeGreaterThanOrEqual(4);
    const committedPages = initial.pages;
    const committedText = initial.pages.map(page => page.paragraphs.join('\n'));

    let state = initial;
    for (const pageIndex of [0, 1, 2, 3, 2, 1]) {
      state = movePagedReaderToPage(state, pageIndex);
      const view = behavior(state);

      expect(view.displayedPageNumber).toBe(pageIndex + 1);
      expect(view.currentPage?.paragraphs.join('\n')).toBe(
        committedText[pageIndex],
      );
      expect(state.pages).toBe(committedPages);
    }
  });

  test('2 -> 3(ad) -> 4 does not mutate physical pages or numbering', () => {
    const initial = paginate(passages(24), {
      bannerReserve: 56,
      pagesPerBanner: 3,
    });
    const committedPages = initial.pages;
    const committedText = initial.pages.map(page => page.paragraphs.join('\n'));

    let state = movePagedReaderToPage(initial, 1);
    let view = behavior(state, {bannerReadyHeight: 56});
    expect(view.displayedPageNumber).toBe(2);
    expect(view.pageBannerActive).toBe(false);

    state = movePagedReaderToPage(state, 2);
    view = behavior(state, {bannerReadyHeight: 56});
    expect(view.displayedPageNumber).toBe(3);
    expect(view.pageBannerActive).toBe(true);
    expect(committedPageBodyHeight(124, view)).toBe(180);

    state = movePagedReaderToPage(state, 3);
    view = behavior(state, {bannerReadyHeight: 56});
    expect(view.displayedPageNumber).toBe(4);
    expect(view.pageBannerActive).toBe(false);
    expect(state.pages).toBe(committedPages);
    expect(state.pages.map(page => page.paragraphs.join('\n'))).toEqual(
      committedText,
    );
  });

  test('off-by-one numbering is derived only from the canonical page index', () => {
    const initial = paginate(passages(24));

    for (let pageIndex = 0; pageIndex < initial.pages.length; pageIndex += 1) {
      const state = movePagedReaderToPage(initial, pageIndex);
      expect(behavior(state).displayedPageNumber).toBe(pageIndex + 1);
    }
  });

  test('rapid navigation never exposes text from another physical page', () => {
    const initial = paginate(passages(30));
    const expected = initial.pages.map(page => page.paragraphs.join('\n'));
    const sequence = [
      1, 2, 3, 4, 3, 4, 2, 1, 2, 3, 0, 1, 0,
    ].filter(index => index < initial.pages.length);

    let state = initial;
    for (const pageIndex of sequence) {
      state = movePagedReaderToPage(state, pageIndex);
      const view = behavior(state);
      expect(view.currentPage?.pageIndex).toBe(pageIndex);
      expect(view.currentPage?.paragraphs.join('\n')).toBe(expected[pageIndex]);
    }
  });

  test('forward behavior distinguishes physical pages from interaction screen', () => {
    const initial = paginate(passages(18));
    const middle = movePagedReaderToPage(initial, 1);
    const middleView = behavior(middle);

    expect(resolvePagedReaderForwardAction(middleView, middle, false)).toEqual({
      type: 'page',
      pageIndex: 2,
    });

    const last = movePagedReaderToPage(initial, initial.pages.length - 1);
    const lastView = behavior(last);
    expect(resolvePagedReaderForwardAction(lastView, last, false)).toEqual({
      type: 'interaction',
    });

    const interaction = behavior(last, {interactionRequested: true});
    expect(interaction.interactionVisible).toBe(true);
    expect(interaction.displayedPageNumber).toBeNull();
  });

  test('long or multiline choices cannot redistribute narrative pages', () => {
    const initial = paginate(passages(24));
    const committedPages = initial.pages;
    const last = movePagedReaderToPage(initial, initial.pages.length - 1);

    const shortChoiceView = behavior(last, {
      interactionRequested: true,
      hasInteraction: true,
    });
    const multilineChoiceView = behavior(last, {
      interactionRequested: true,
      hasInteraction: true,
    });

    expect(shortChoiceView.interactionVisible).toBe(true);
    expect(multilineChoiceView.interactionVisible).toBe(true);
    expect(last.pages).toBe(committedPages);
    expect(last.pages.map(page => page.key)).toEqual(
      committedPages.map(page => page.key),
    );
  });

  test('failed banner creates no empty reserve and slow load affects only new pages', () => {
    const firstPassages = passages(10);
    const initial = paginate(firstPassages);
    const committedPages = initial.pages;

    expect(initial.pages.every(page => page.bannerReserve === 0)).toBe(true);
    expect(
      behavior(movePagedReaderToPage(initial, 0), {bannerReadyHeight: 0})
        .pageBannerActive,
    ).toBe(false);

    const nextPassages = [...firstPassages, ...passages(8).map(text => `Новый ${text}`)];
    const request = planPaginationMeasurement(initial, nextPassages, 56, 3);
    if (!request) {
      throw new Error('Expected append request after delayed banner load.');
    }

    const appended = commitPaginationMeasurement(
      initial,
      request,
      request.text.split('\n'),
    );

    expect(appended.pages.slice(0, committedPages.length)).toEqual(
      committedPages,
    );
    for (let index = 0; index < committedPages.length; index += 1) {
      expect(appended.pages[index]).toBe(committedPages[index]);
      expect(appended.pages[index].bannerReserve).toBe(0);
    }
  });

  test.each([1, 1.35])(
    'font scale %s produces committed pages with matching geometry revision',
    fontScale => {
      const state = paginate(passages(24), {fontScale});
      const view = behavior(state);

      expect(state.geometry?.fontScale).toBe(fontScale);
      expect(
        state.pages.every(
          page => page.geometryRevision === state.geometryRevision,
        ),
      ).toBe(true);
      expect(view.pageTransitionReady).toBe(true);
    },
  );

  test('maximum font scale reduces capacity instead of overlapping content', () => {
    const normal = paginate(passages(24), {fontScale: 1});
    const scaled = paginate(passages(24), {fontScale: 1.35});

    expect(scaled.pages.length).toBeGreaterThan(normal.pages.length);
    expect(
      Math.max(...scaled.pages.map(page => page.lines.length)),
    ).toBeLessThan(
      Math.max(...normal.pages.map(page => page.lines.length)),
    );
  });

  test('delayed layout callback from an old geometry revision is ignored', () => {
    const source = passages(18);
    let state = updatePagedReaderGeometry(
      createPagedReaderState(),
      BASE_GEOMETRY,
    );
    const staleRequest = planPaginationMeasurement(state, source);
    if (!staleRequest) {
      throw new Error('Expected initial pagination request.');
    }

    state = updatePagedReaderGeometry(state, {
      ...BASE_GEOMETRY,
      height: 220,
    });
    const afterGeometryChange = state;
    state = commitPaginationMeasurement(
      state,
      staleRequest,
      staleRequest.text.split('\n'),
    );

    expect(state).toBe(afterGeometryChange);
    expect(state.pages).toHaveLength(0);

    const currentRequest = planPaginationMeasurement(state, source);
    if (!currentRequest) {
      throw new Error('Expected current pagination request.');
    }
    state = commitPaginationMeasurement(
      state,
      currentRequest,
      currentRequest.text.split('\n'),
    );

    expect(state.pages.length).toBeGreaterThan(0);
    expect(
      state.pages.every(
        page => page.geometryRevision === state.geometryRevision,
      ),
    ).toBe(true);
  });

  test('pending pagination hides both the page number and navigation', () => {
    const state = paginate(passages(18));
    const view = behavior(state, {paginationPending: true});

    expect(view.pageTransitionReady).toBe(false);
    expect(view.displayedPageNumber).toBeNull();
    expect(view.canGoNext).toBe(false);
    expect(view.canGoPrevious).toBe(false);
    expect(resolvePagedReaderForwardAction(view, state, false)).toEqual({
      type: 'none',
    });
  });
});
