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
  test('choice and ending UI use a separate unnumbered interaction screen', () => {
    const app = source('src/app/AppV018Stable.tsx');
    const pagination = source('src/app/PagedReaderPagination.ts');

    expect(app).toContain(
      'const [pagedInteractionVisible, setPagedInteractionVisible] = useState(false);',
    );
    expect(app).toContain('pagedInteractionSnapshot');
    expect(app).toContain('pagedInteractionTargetPassageCount');
    expect(app).toContain('const canOpenPagedInteraction =');
    expect(app).toContain('const isPagedInteractionVisible =');
    expect(app).toContain('{isPagedInteractionVisible ? (');
    expect(app).toContain('styles.pagedInteractionContent');
    expect(app).toContain('(pagedInteractionSnapshot ?? snapshot).isEnded');
    expect(app).toContain('pagedInteractionSnapshot ?? snapshot');
    expect(app).toContain('setPagedInteractionVisible(true);');
    expect(app).toContain('setPagedInteractionVisible(false);');
    expect(app).not.toContain('interactionDock');
    expect(pagination).not.toContain('interactionReserve');
    expect(pagination).not.toContain('getChoiceReserve');
  });

  test('choice screen remains mounted until appended narrative pages are committed', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain(
      'setPagedInteractionTargetPassageCount(result.snapshot.passages.length);',
    );
    expect(app).toContain(
      'pagedReader.processedPassageCount < pagedInteractionTargetPassageCount',
    );
    expect(app).toContain('paginationRequest !== null');
    expect(app).toContain('setPagedInteractionSnapshot(snapshot);');
    expect(app).toContain('!pagedInteractionTransitionPending');
    expect(app).toContain(
      'disabled={isBusy || pagedInteractionTransitionPending}',
    );
    expect(app).not.toContain(
      'setPagedInteractionVisible(false);\n      setSnapshot(result.snapshot);',
    );
  });

  test('choice transition advances from the single canonical page index', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain(
      "readerMode === 'pages' ? pagedReader.currentPageIndex + 1 : undefined;",
    );
    expect(app).toContain(
      'const result = session.choose(choiceIndex, nextReaderPageIndex);',
    );
    expect(app).not.toContain(
      'const result = await session.choose(choiceIndex, nextReaderPageIndex);',
    );
    const snapshotCommit = app.indexOf('setSnapshot(result.snapshot);');
    const persistenceAwait = app.indexOf(
      'const persisted = await result.persistence;',
    );
    expect(snapshotCommit).toBeGreaterThan(-1);
    expect(persistenceAwait).toBeGreaterThan(snapshotCommit);
    expect(app).toContain('void recordEnding(activeStory.id, result.snapshot);');
    expect(app).not.toContain('stablePageFrameRef');
    expect(app).not.toContain('lastPageNumberRef');
    expect(app).not.toContain('pageOrdinalRef');
  });

  test('page measurement stays offscreen, survives interaction screens and commits immutable physical pages', () => {
    const app = source('src/app/AppV018Stable.tsx');
    const pagesRenderStart = app.indexOf("{readerMode === 'pages' ? (");
    const measurementIndex = app.indexOf(
      'key={`measurement-${paginationRequest.key}`}',
      pagesRenderStart,
    );
    const interactionIndex = app.indexOf(
      '{isPagedInteractionVisible ? (',
      pagesRenderStart,
    );

    expect(app).toContain('top: -10000');
    expect(app).toContain("color: 'transparent'");
    expect(measurementIndex).toBeGreaterThan(pagesRenderStart);
    expect(measurementIndex).toBeLessThan(interactionIndex);
    expect(app).toContain(
      'commitPaginationMeasurement(current, request, lines)',
    );
    expect(app).toContain("key={`page-${currentPage.key}`}");
    expect(app).toContain("{currentPage.lines.join('\\n')}");
    expect(app).not.toContain(
      ".map((paragraph, index) => (",
    );
    expect(app).not.toContain('measurementKeyRef');
    expect(app).not.toContain('readerRevision');
  });

  test('reader state has one canonical cursor and no render-time frame mutation', () => {
    const app = source('src/app/AppV018Stable.tsx');
    const pagination = source('src/app/PagedReaderPagination.ts');

    expect(app).toContain(
      'const [pagedReader, setPagedReader] = useState(createPagedReaderState);',
    );
    expect(app).toContain('const pagedReaderIndexRef = useRef(0);');
    expect(app).toContain(
      'pagedReaderIndexRef.current = pagedReader.currentPageIndex;',
    );
    expect(pagination).toContain('currentPageIndex: number;');
    expect(pagination).toContain('geometryRevision: number;');
    expect(pagination).toContain('pages: readonly ReaderPhysicalPage[];');
    expect(pagination).toContain('lines: readonly string[];');
    expect(app).not.toContain('setReaderPageIndex');
    expect(app).not.toContain('setPageNumber(');
    expect(app).not.toContain('.current = {');
  });

  test('physical page number is derived from the canonical index and hidden on interaction screens', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain('!isPagedInteractionVisible && pageTransitionReady');
    expect(app).toContain('pagedReader.currentPageIndex + 1');
    expect(app).toContain('{displayedPageNumber ?? \'\'}');
    expect(app).toContain('styles.pageFooterCenterSpacer');
    expect(app).not.toContain('lastPageNumberRef');
    expect(app).not.toContain('pageOrdinal');
    expect(app).not.toContain('const [pageNumber, setPageNumber]');
  });

  test('next and previous only move the cursor and persist the target semantic anchor', () => {
    const app = source('src/app/AppV018Stable.tsx');
    const pagination = source('src/app/PagedReaderPagination.ts');

    expect(app).toContain('const pageUpdate = session.setPage(');
    expect(app).toContain('nextPageIndex, nextPage.anchor');
    expect(app).toContain('void pageUpdate.persistence.then(persisted => {');
    expect(app).toContain(
      'const previousPageIndex = pagedReaderIndexRef.current;',
    );
    expect(app).toContain('pagedReaderIndexRef.current = nextPageIndex;');
    expect(app).toContain(
      'void moveToPage(pagedReaderIndexRef.current - 1);',
    );
    expect(app).not.toContain(
      'await session.setPage(nextPageIndex, nextPage.anchor)',
    );
    const moveStart = app.indexOf('const moveToPage = useCallback(');
    const moveEnd = app.indexOf('const openPagedInteraction', moveStart);
    const moveSource = app.slice(moveStart, moveEnd);
    expect(moveSource).not.toContain('beginMutation()');
    expect(moveSource).not.toContain('setSnapshot(');
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
    expect(pagination).toContain('const measurementSources = sources.filter(');
    expect(pagination).toContain('return insertSyntheticPageBreaks(sources, lines);');
    expect(pagination).toContain('if (measuredPages.length === 0)');
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
    expect(pagination).toContain('READER_MAX_FONT_SIZE_MULTIPLIER = 1.35');
    expect(pagination).toContain(
      'Math.min(Math.max(fontScale, 1), READER_MAX_FONT_SIZE_MULTIPLIER)',
    );
    expect(app).toContain('measuredLines.map(line => line.height)');
    expect(pagination).toContain('Math.ceil(measuredLineHeight)');
  });

  test('banner lifecycle uses native readiness and immutable per-page reserve metadata', () => {
    const app = source('src/app/AppV018Stable.tsx');
    const pagination = source('src/app/PagedReaderPagination.ts');
    const yandexAds = source('src/ads/yandex/YandexAdsProvider.tsx');
    const nativeBanner = source(
      'android/app/src/main/java/io/github/regstar2/textquestanthology/MainActivity.kt',
    );
    const nativeModule = source(
      'android/app/src/main/java/io/github/regstar2/textquestanthology/NativeBannerModule.kt',
    );

    expect(app).toContain('const [bannerReadyHeight, setBannerReadyHeight] = useState(0);');
    expect(app).toContain('onReadyHeightChange={setBannerReadyHeight}');
    expect(app).toContain('currentPage.bannerReserve > 0');
    expect(app).toContain('currentPage.bannerReserve === bannerReadyHeight');
    expect(app).toContain(
      '(pageBannerActive ? currentPage.bannerReserve : 0)',
    );
    expect(app).not.toContain('bannerReservedHeight');
    expect(app).not.toContain('reservePagedBannerSlot');

    expect(pagination).toContain('bannerReserve: number;');
    expect(pagination).toContain('function getPageBannerReserve(');
    expect(pagination).toContain('bannerReserve,\n  });');

    expect(yandexAds).toContain('DeviceEventEmitter.addListener(');
    expect(yandexAds).toContain('nativeBannerController.getState().then(handleEvent)');
    expect(yandexAds).toContain("event.state === 'loaded'");
    expect(yandexAds).toContain("event.state === 'shown'");
    expect(yandexAds).toContain("event.state === 'hidden' && event.heightDp > 0");
    expect(yandexAds).toContain("event.state === 'failed'");
    expect(yandexAds).toContain('visible && readyHeight > 0 ? readyHeight : 0');
    expect(yandexAds).toContain(
      'getNativeBannerController()?.prepare(ADS_CONFIG.adUnits.banner);',
    );
    expect(yandexAds).not.toContain('useWindowDimensions');
    expect(yandexAds).not.toContain('reservedHeight');

    expect(nativeBanner).toContain('BannerAdSize.sticky(this, adWidthDp)');
    expect(nativeBanner).toContain('setBannerAdEventListener(');
    expect(nativeBanner).toContain('emitBannerState("loaded")');
    expect(nativeBanner).toContain('emitBannerState("failed", 0)');
    expect(nativeBanner).toContain('emitBannerState("shown")');
    expect(nativeBanner).toContain('"hidden"');
    expect(nativeBanner).not.toContain('BannerAdSize.inline(');
    expect(nativeModule).toContain('const val EVENT_NAME = "NativeBannerStateChanged"');
  });

  test('reader cursor uses non-blocking native writes while narrative saves stay durable', () => {
    const storage = source(
      'android/app/src/main/java/io/github/regstar2/textquestanthology/StorySaveStorageModule.kt',
    );

    expect(storage).toMatch(
      /fun setItem\([\s\S]*?putString\(key, value\)\.commit\(\)/,
    );
    expect(storage).toMatch(
      /fun setItemDeferred\([\s\S]*?putString\(key, value\)\.apply\(\)/,
    );
  });

  test('reader notice is an overlay and cannot participate in page layout', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toMatch(
      /readerNotice:\s*\{\s*position: 'absolute',[\s\S]*?zIndex: 20,/,
    );
  });

  test('choices persist page boundaries without exposing control markers to native layout', () => {
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
    expect(pagination).toContain('const measurementSources = sources.filter(');
    expect(pagination).toContain(
      'source => !source.text.startsWith(FORCED_PAGE_BREAK_MARKER)',
    );
    expect(pagination).toContain('return insertSyntheticPageBreaks(sources, lines);');
    expect(pagination).not.toContain('getPageBreakReserve');
    expect(pagination).not.toContain('interactionReserve');
    expect(app).toContain(
      '!passage.startsWith(FORCED_PAGE_BREAK_MARKER)',
    );
  });

  test('forward navigation opens interaction without consuming a physical page number', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain(
      'if (pagedReader.currentPageIndex < pagedReader.pages.length - 1) {',
    );
    expect(app).toContain('void moveToPage(pagedReader.currentPageIndex + 1);');
    expect(app).toContain('openPagedInteraction();');
    expect(app).toContain('onPress={advancePagedReader}');
    expect(app).toContain('onPress={closePagedInteraction}');
    expect(app).not.toContain('setPagedReader(current => movePagedReaderToPage(current, pagedReader.pages.length))');
  });

  test('semantic reader anchor is part of snapshot and persistent save data', () => {
    const session = source('src/narrative/StorySession.ts');
    const repository = source('src/persistence/StorySaveRepository.ts');

    expect(session).toContain('pageAnchor: ReaderSemanticAnchor | null;');
    expect(session).toContain('readerPageAnchor: this.readerPageAnchor,');
    expect(repository).toContain('readerPageAnchor?: ReaderSemanticAnchor | null;');
    expect(repository).toContain('export type ReaderCursor = Readonly<{');
    expect(repository).toContain('pageAnchor: ReaderSemanticAnchor | null;');
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