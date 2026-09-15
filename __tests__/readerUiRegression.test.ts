export {};

const fs = jest.requireActual('fs') as {
  readFileSync(path: string, encoding: 'utf8'): string;
};
const pathModule = jest.requireActual('path') as {
  join(...paths: string[]): string;
};
const processModule = jest.requireActual('process') as {
  cwd(): string;
};

function source(path: string): string {
  return fs
    .readFileSync(pathModule.join(processModule.cwd(), path), 'utf8')
    .replace(/\r\n/g, '\n');
}

describe('v0.3.0 deterministic paged reader regressions', () => {
  test('interaction dock is only mounted on the committed choice or ending page', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain('{isInteractionPage ? (');
    expect(app).not.toContain('interactionDockHidden');
    expect(app).toContain('isEndingPage ? renderEndingActions() : renderChoices(true)');
    expect(app).toContain('const readerContentCommitted =');
    expect(app).toContain(
      'pagedReader.processedPassageCount === readerParagraphs.length;',
    );
  });

  test('choice transition advances from the single canonical page index', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain(
      "readerMode === 'pages' ? pagedReader.currentPageIndex + 1 : undefined;",
    );
    expect(app).toContain(
      'const result = await session.choose(choiceIndex, nextReaderPageIndex);',
    );
    expect(app).toContain('void recordEnding(activeStory.id, result.snapshot);');
    expect(app).not.toContain('stablePageFrameRef');
    expect(app).not.toContain('lastPageNumberRef');
    expect(app).not.toContain('pageOrdinalRef');
  });

  test('page measurement stays offscreen and commits immutable physical pages', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain('top: -10000');
    expect(app).toContain("color: 'transparent'");
    expect(app).toContain('key={`measurement-${paginationRequest.key}`}');
    expect(app).toContain(
      'commitPaginationMeasurement(current, request, lines)',
    );
    expect(app).toContain("key={`page-${currentPage?.key ?? 'empty'}-${index}`}");
    expect(app).not.toContain('measurementKeyRef');
    expect(app).not.toContain('readerRevision');
  });

  test('reader state has one canonical cursor and no render-time frame mutation', () => {
    const app = source('src/app/AppV018Stable.tsx');
    const pagination = source('src/app/PagedReaderPagination.ts');

    expect(app).toContain(
      'const [pagedReader, setPagedReader] = useState(createPagedReaderState);',
    );
    expect(pagination).toContain('currentPageIndex: number;');
    expect(pagination).toContain('geometryRevision: number;');
    expect(pagination).toContain('pages: readonly ReaderPhysicalPage[];');
    expect(app).not.toContain('setReaderPageIndex');
    expect(app).not.toContain('setPageNumber(');
    expect(app).not.toContain('.current = {');
  });

  test('page number is derived exclusively from currentPageIndex plus one', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain('pagedReader.currentPageIndex + 1');
    expect(app).toContain('{displayedPageNumber ?? \'\'}');
    expect(app).not.toContain('lastPageNumberRef');
    expect(app).not.toContain('pageOrdinal');
    expect(app).not.toContain('const [pageNumber, setPageNumber]');
  });

  test('next and previous only move the cursor and persist the target semantic anchor', () => {
    const app = source('src/app/AppV018Stable.tsx');
    const pagination = source('src/app/PagedReaderPagination.ts');

    expect(app).toContain(
      'setPagedReader(current => movePagedReaderToPage(current, nextPageIndex));',
    );
    expect(app).toContain(
      'const result = await session.setPage(nextPageIndex, nextPage.anchor);',
    );
    expect(pagination).toContain(': {...state, currentPageIndex};');
    expect(app).not.toContain('setPaginationRequest(' + 'planPaginationMeasurement');
  });

  test('new narrative content is planned as an append while geometry stays unchanged', () => {
    const pagination = source('src/app/PagedReaderPagination.ts');

    expect(pagination).toContain("kind: 'full' | 'append';");
    expect(pagination).toContain(
      'const startPassageIndex = needsFullPagination',
    );
    expect(pagination).toContain("const kind = needsFullPagination ? 'full' : 'append';");
    expect(pagination).toContain(
      'const pages = Object.freeze([...state.pages, ...measuredPages]);',
    );
    expect(pagination).toContain('processedPassageCount: request.sourcePassageCount,');
  });

  test('geometry and font-scale changes trigger full pagination with semantic-anchor restoration', () => {
    const app = source('src/app/AppV018Stable.tsx');
    const pagination = source('src/app/PagedReaderPagination.ts');

    expect(app).toContain('updatePagedReaderGeometry(current, {');
    expect(app).toContain('width: current.geometry.width,');
    expect(app).toContain('height: current.geometry.height,');
    expect(app).toContain('}, [fontScale, readerMode]);');
    expect(pagination).toContain('geometryRevision: state.geometryRevision + 1,');
    expect(pagination).toContain('restoreAnchor: currentPage?.anchor ?? state.restoreAnchor,');
    expect(pagination).toContain('function restorePageIndex(');
    expect(pagination).toContain('compareReaderSemanticAnchors');
  });

  test('banner visibility does not resize committed page geometry', () => {
    const app = source('src/app/AppV018Stable.tsx');
    const yandexAds = source('src/ads/yandex/YandexAdsProvider.tsx');

    expect(app).toContain("const reservePagedBannerSlot = screen === 'reader' && readerMode === 'pages';");
    expect(app).toContain('styles.pagedBannerSlot, {height: bannerReservedHeight}');
    expect(app).toContain(
      '(pagedReader.currentPageIndex + 1) %',
    );
    expect(yandexAds).toContain(
      'height: canShowNativeBanner && visible ? reservedHeight : 0,',
    );
    expect(app).not.toContain('setPageBannerVisible');
    expect(app).not.toContain('pageLayoutPending');
  });

  test('reader notice is an overlay and cannot participate in page layout', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toMatch(
      /readerNotice:\s*\{\s*position: 'absolute',[\s\S]*?zIndex: 20,/,
    );
  });

  test('choices persist page boundaries with their original interaction reserve', () => {
    const app = source('src/app/AppV018Stable.tsx');
    const session = source('src/narrative/StorySession.ts');
    const pagination = source('src/app/PagedReaderPagination.ts');

    expect(session).toContain("export const READER_PAGE_BREAK_MARKER = '\\uE001';");
    expect(session).toContain(
      'const previousChoiceCount = this.currentSnapshot.choices.length;',
    );
    expect(session).toContain(
      '`${READER_PAGE_BREAK_MARKER}:${previousChoiceCount}`',
    );
    expect(pagination).toContain('let segmentStart = 0;');
    expect(pagination).toContain(
      'measuredLines[index].text.includes(FORCED_PAGE_BREAK_MARKER)',
    );
    expect(pagination).toContain(
      'getPageBreakReserve(measuredLines[index].text)',
    );
    expect(app).toContain(
      '!passage.startsWith(FORCED_PAGE_BREAK_MARKER)',
    );
  });

  test('semantic reader anchor is part of snapshot and persistent save data', () => {
    const session = source('src/narrative/StorySession.ts');
    const repository = source('src/persistence/StorySaveRepository.ts');

    expect(session).toContain('pageAnchor: ReaderSemanticAnchor | null;');
    expect(session).toContain('readerPageAnchor: this.readerPageAnchor,');
    expect(repository).toContain('readerPageAnchor?: ReaderSemanticAnchor | null;');
    expect(repository).toContain('isOptionalReaderPageAnchor(value.readerPageAnchor)');
  });

  test('pages mode still uses accumulated transcript and feed-to-pages opens its end', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain('const passages = snapshot.passages');
    expect(app).toContain('if (passages.length === 0)');
    expect(app).toContain('return passages;');
    expect(app).toContain('resetPagedReader(null, Number.MAX_SAFE_INTEGER);');
    expect(app).not.toContain(
      'setSnapshot({...snapshot, pageIndex: Number.MAX_SAFE_INTEGER});',
    );
  });

  test('ending restart acts directly and ending labels expose number plus name', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toMatch(
      /setMenuView\(null\);\s+const session = sessionRef\.current;/,
    );
    expect(app).toContain('void restartActiveStory();');
    expect(app).toContain('formatEndingDisplay(snapshot.endingId)');
    expect(app).toContain('formatEndingDisplay(ending.id)');
    expect(app).toContain('`${UI_STRINGS.endingLabel} №${number}${name ? ` · ${name}` : \'\'}`');
  });
});
