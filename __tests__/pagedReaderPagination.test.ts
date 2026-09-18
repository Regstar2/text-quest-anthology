import {
  FORCED_PAGE_BREAK_MARKER,
  commitPaginationMeasurement,
  createPagedReaderState,
  getChoiceReserve,
  movePagedReaderToPage,
  planPaginationMeasurement,
  resetPagedReaderState,
  updatePagedReaderGeometry,
} from '../src/app/PagedReaderPagination';

describe('deterministic paged reader model', () => {
  const geometry = {width: 360, height: 180, fontScale: 1};

  function firstCommit(passages: readonly string[]) {
    let state = updatePagedReaderGeometry(createPagedReaderState(), geometry);
    const request = planPaginationMeasurement(state, passages, 0);
    if (!request) {
      throw new Error('Expected initial pagination request.');
    }
    state = commitPaginationMeasurement(state, request, request.text.split('\n'));
    return state;
  }

  test('page navigation only changes the canonical index', () => {
    const passages = [
      'Первый абзац.',
      'Второй абзац.',
      'Третий абзац.',
      'Четвёртый абзац.',
      'Пятый абзац.',
      'Шестой абзац.',
      'Седьмой абзац.',
    ];
    const initial = firstCommit(passages);
    expect(initial.pages.length).toBeGreaterThan(1);

    const moved = movePagedReaderToPage(initial, 1);
    expect(moved.currentPageIndex).toBe(1);
    expect(moved.pages).toBe(initial.pages);
    expect(moved.geometryRevision).toBe(initial.geometryRevision);
    expect(planPaginationMeasurement(moved, passages, 0)).toBeNull();
  });

  test('appending narrative content keeps committed pages immutable', () => {
    const firstPassages = ['Первая сцена.', 'Вторая строка.'];
    const initial = firstCommit(firstPassages);
    const committedFirstPage = initial.pages[0];

    const nextPassages = [
      ...firstPassages,
      `${FORCED_PAGE_BREAK_MARKER}:2`,
      'Новая сцена после выбора.',
      'Продолжение новой сцены.',
    ];
    const request = planPaginationMeasurement(
      initial,
      nextPassages,
      getChoiceReserve(2),
    );
    expect(request?.kind).toBe('append');
    expect(request?.startPassageIndex).toBe(firstPassages.length);
    expect(request?.text).not.toContain(FORCED_PAGE_BREAK_MARKER);
    if (!request) {
      throw new Error('Expected append pagination request.');
    }

    const committed = commitPaginationMeasurement(
      initial,
      request,
      request.text.split('\n'),
    );
    expect(committed.pages[0]).toBe(committedFirstPage);
    expect(committed.pages[0].paragraphs).toEqual(
      committedFirstPage.paragraphs,
    );
    expect(committed.currentPageIndex).toBe(initial.pages.length);
    expect(committed.processedPassageCount).toBe(nextPassages.length);
    expect(committed.pages[committed.currentPageIndex].paragraphs.join(' ')).toContain(
      'Новая сцена после выбора.',
    );
  });

  test('forced page markers are restored after native text measurement', () => {
    let state = updatePagedReaderGeometry(createPagedReaderState(), geometry);
    const passages = [
      'Первая сцена.',
      `${FORCED_PAGE_BREAK_MARKER}:1`,
      'Вторая сцена.',
    ];
    const request = planPaginationMeasurement(state, passages, 0);
    if (!request) {
      throw new Error('Expected pagination request.');
    }

    expect(request.text).not.toContain(FORCED_PAGE_BREAK_MARKER);
    state = commitPaginationMeasurement(state, request, request.text.split('\n'));

    expect(state.processedPassageCount).toBe(passages.length);
    expect(state.pages.map(page => page.paragraphs.join(' ')).join(' ')).toContain(
      'Вторая сцена.',
    );
  });

  test('banner reserve reduces only deterministic banner pages', () => {
    let state = updatePagedReaderGeometry(createPagedReaderState(), geometry);
    const passages = Array.from({length: 12}, (_, index) => `Строка ${index + 1}.`);
    const request = planPaginationMeasurement(state, passages, 0, 56, 2);
    if (!request) {
      throw new Error('Expected pagination request.');
    }

    state = commitPaginationMeasurement(state, request, request.text.split('\n'));

    expect(state.pages).toHaveLength(3);
    expect(state.pages[0].paragraphs).toHaveLength(6);
    expect(state.pages[1].paragraphs).toHaveLength(4);
    expect(state.pages[2].paragraphs).toHaveLength(2);
  });

  test('prefers paragraph boundaries instead of splitting a short paragraph across pages', () => {
    let state = updatePagedReaderGeometry(createPagedReaderState(), {
      width: 360,
      height: 124,
      fontScale: 1,
    });
    const passages = [
      'Первая строка.',
      'Вторая строка.',
      'Порыв ветра ударил дождём сбоку. Лера отвернулась и натянула капюшон ниже.',
      'Следующий абзац.',
    ];
    const request = planPaginationMeasurement(state, passages, 0);
    if (!request) {
      throw new Error('Expected pagination request.');
    }

    const rawLines = [
      '  Первая строка.\n',
      '  Вторая строка.\n',
      '  Порыв ветра ударил дождём сбоку.',
      'Лера отвернулась и натянула капюшон ниже.\n',
      '  Следующий абзац.',
    ];
    state = commitPaginationMeasurement(state, request, rawLines);

    expect(state.pages[0].paragraphs).toEqual([
      '  Первая строка.',
      '  Вторая строка.',
    ]);
    expect(state.pages[1].paragraphs[0]).toContain(
      'Порыв ветра ударил дождём сбоку. Лера отвернулась и натянула капюшон ниже.',
    );
  });

  test('puts choices on a separate page instead of forcing a narrative fragment beside them', () => {
    let state = updatePagedReaderGeometry(createPagedReaderState(), geometry);
    const passages = [
      'Первый абзац.',
      'Второй абзац.',
      'Третий абзац.',
      'Четвёртый абзац.',
      'Пятый абзац.',
      'Шестой абзац.',
    ];
    const request = planPaginationMeasurement(
      state,
      passages,
      getChoiceReserve(4),
    );
    if (!request) {
      throw new Error('Expected pagination request.');
    }

    state = commitPaginationMeasurement(state, request, request.text.split('\n'));

    const lastPage = state.pages[state.pages.length - 1];
    expect(lastPage.paragraphs).toEqual([]);
    expect(state.pages[state.pages.length - 2].paragraphs.length).toBeGreaterThan(0);
  });

  test('real geometry change triggers full pagination and restores semantic position', () => {
    const passages = [
      'Один.',
      'Два.',
      'Три.',
      'Четыре.',
      'Пять.',
      'Шесть.',
      'Семь.',
    ];
    const initial = firstCommit(passages);
    const moved = movePagedReaderToPage(initial, 1);
    const anchor = moved.pages[1].anchor;

    const resized = updatePagedReaderGeometry(moved, {
      width: 640,
      height: 240,
      fontScale: 1,
    });
    expect(resized.geometryRevision).toBe(moved.geometryRevision + 1);
    expect(resized.restoreAnchor).toEqual(anchor);

    const request = planPaginationMeasurement(resized, passages, 0);
    expect(request?.kind).toBe('full');
    if (!request) {
      throw new Error('Expected full pagination request.');
    }
    const repaginated = commitPaginationMeasurement(
      resized,
      request,
      request.text.split('\n'),
    );

    const restoredPage = repaginated.pages[repaginated.currentPageIndex];
    expect(restoredPage.anchor.passageIndex).toBeLessThanOrEqual(
      anchor.passageIndex,
    );
    expect(repaginated.restoreAnchor).toBeNull();
  });

  test('resume target survives reset until the first geometry commit', () => {
    const restoredAnchor = {passageIndex: 4, characterOffset: 0};
    const reset = resetPagedReaderState(
      createPagedReaderState(),
      restoredAnchor,
      Number.MAX_SAFE_INTEGER,
    );
    const withGeometry = updatePagedReaderGeometry(reset, geometry);

    expect(withGeometry.restoreAnchor).toEqual(restoredAnchor);
    expect(withGeometry.fallbackPageIndex).toBe(Number.MAX_SAFE_INTEGER);
  });

  test('same geometry does not create a new revision', () => {
    const first = updatePagedReaderGeometry(createPagedReaderState(), geometry);
    const same = updatePagedReaderGeometry(first, {...geometry});
    expect(same).toBe(first);
  });
});