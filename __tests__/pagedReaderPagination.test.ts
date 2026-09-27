import {
  FORCED_PAGE_BREAK_MARKER,
  commitPaginationMeasurement,
  createPagedReaderState,
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
    const request = planPaginationMeasurement(initial, nextPassages);
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
    const request = planPaginationMeasurement(state, passages, 56, 2);
    if (!request) {
      throw new Error('Expected pagination request.');
    }

    state = commitPaginationMeasurement(state, request, request.text.split('\n'));

    expect(state.pages).toHaveLength(3);
    expect(state.pages[0].paragraphs).toHaveLength(6);
    expect(state.pages[0].bannerReserve).toBe(0);
    expect(state.pages[1].paragraphs).toHaveLength(4);
    expect(state.pages[1].bannerReserve).toBe(56);
    expect(state.pages[2].paragraphs).toHaveLength(2);
    expect(state.pages[2].bannerReserve).toBe(0);
  });

  test('late banner readiness affects only newly appended physical pages', () => {
    const firstPassages = Array.from(
      {length: 12},
      (_, index) => `Строка ${index + 1}.`,
    );
    let state = updatePagedReaderGeometry(createPagedReaderState(), geometry);
    const firstRequest = planPaginationMeasurement(state, firstPassages, 0, 3);
    if (!firstRequest) {
      throw new Error('Expected initial pagination request.');
    }

    state = commitPaginationMeasurement(
      state,
      firstRequest,
      firstRequest.text.split('\n'),
    );
    const committedPages = state.pages;

    expect(state.pages).toHaveLength(2);
    expect(state.pages.every(page => page.bannerReserve === 0)).toBe(true);
    expect(planPaginationMeasurement(state, firstPassages, 56, 3)).toBeNull();

    const nextPassages = [
      ...firstPassages,
      'Новая строка 13.',
      'Новая строка 14.',
      'Новая строка 15.',
      'Новая строка 16.',
    ];
    const appendRequest = planPaginationMeasurement(state, nextPassages, 56, 3);
    if (!appendRequest) {
      throw new Error('Expected append pagination request.');
    }

    const appended = commitPaginationMeasurement(
      state,
      appendRequest,
      appendRequest.text.split('\n'),
    );

    expect(appended.pages[0]).toBe(committedPages[0]);
    expect(appended.pages[1]).toBe(committedPages[1]);
    expect(appended.pages[2].bannerReserve).toBe(56);
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
      '  Порыв ветра ударил дождём сбоку. Лера отвернулась и натянула капюшон ниже.',
    ]);
    expect(state.pages[1].paragraphs).toEqual(['  Следующий абзац.']);
  });

  test('choice boundaries do not reserve or redistribute narrative page space', () => {
    let state = updatePagedReaderGeometry(createPagedReaderState(), geometry);
    const passages = [
      'Первый абзац.',
      'Второй абзац.',
      'Третий абзац.',
      'Четвёртый абзац.',
      'Пятый абзац.',
      'Шестой абзац.',
      `${FORCED_PAGE_BREAK_MARKER}:4`,
      'Новая сцена.',
    ];
    const request = planPaginationMeasurement(state, passages);
    if (!request) {
      throw new Error('Expected pagination request.');
    }

    state = commitPaginationMeasurement(state, request, request.text.split('\n'));

    expect(state.pages[0].paragraphs).toEqual([
      '  Первый абзац.',
      '  Второй абзац.',
      '  Третий абзац.',
      '  Четвёртый абзац.',
      '  Пятый абзац.',
      '  Шестой абзац.',
    ]);
    expect(state.pages[1].paragraphs).toEqual(['  Новая сцена.']);
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

  test('forward and backward navigation keeps committed page identities and text stable', () => {
    const passages = Array.from(
      {length: 24},
      (_, index) => `Абзац ${index + 1}.`,
    );
    const initial = firstCommit(passages);

    expect(initial.pages).toHaveLength(4);
    const committedPages = initial.pages;
    const committedText = initial.pages.map(page => [...page.paragraphs]);

    let state = initial;
    for (const pageIndex of [1, 2, 3, 2, 1]) {
      state = movePagedReaderToPage(state, pageIndex);

      expect(state.currentPageIndex).toBe(pageIndex);
      expect(state.pages).toBe(committedPages);
      expect(state.pages.map(page => [...page.paragraphs])).toEqual(
        committedText,
      );
      expect(planPaginationMeasurement(state, passages, 0)).toBeNull();
    }
  });

  test('stale measurement from an older geometry revision is ignored', () => {
    const passages = Array.from(
      {length: 12},
      (_, index) => `Строка ${index + 1}.`,
    );
    const initial = firstCommit(passages);
    const committedPages = initial.pages;

    const firstResize = updatePagedReaderGeometry(initial, {
      width: 400,
      height: 180,
      fontScale: 1,
    });
    const staleRequest = planPaginationMeasurement(firstResize, passages, 0);
    if (!staleRequest) {
      throw new Error('Expected pagination request after first resize.');
    }

    const latestResize = updatePagedReaderGeometry(firstResize, {
      width: 420,
      height: 180,
      fontScale: 1,
    });
    const ignored = commitPaginationMeasurement(
      latestResize,
      staleRequest,
      staleRequest.text.split('\n'),
    );

    expect(ignored).toBe(latestResize);
    expect(ignored.pages).toBe(committedPages);
    expect(
      ignored.pages.every(
        page => page.geometryRevision !== ignored.geometryRevision,
      ),
    ).toBe(true);

    const latestRequest = planPaginationMeasurement(ignored, passages, 0);
    expect(latestRequest?.geometryRevision).toBe(ignored.geometryRevision);
    if (!latestRequest) {
      throw new Error('Expected pagination request for latest geometry.');
    }

    const committed = commitPaginationMeasurement(
      ignored,
      latestRequest,
      latestRequest.text.split('\n'),
    );
    expect(
      committed.pages.every(
        page => page.geometryRevision === committed.geometryRevision,
      ),
    ).toBe(true);
  });

  test('same geometry does not create a new revision', () => {
    const first = updatePagedReaderGeometry(createPagedReaderState(), geometry);
    const same = updatePagedReaderGeometry(first, {...geometry});
    expect(same).toBe(first);
  });
});