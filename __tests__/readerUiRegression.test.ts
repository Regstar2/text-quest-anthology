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

describe('v0.1.8 reader UI regressions', () => {
  test('interaction dock is only mounted on the active choice or ending page', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain('{isInteractionPage ? (');
    expect(app).not.toContain('interactionDockHidden');
    expect(app).toContain('isEndingPage ? renderEndingActions() : renderChoices(true)');
  });

  test('terminal transition opens the first page after the previous choice page without blocking on history storage', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain(
      "readerMode === 'pages' ? effectivePageIndex + 1 : undefined;",
    );
    expect(app).toContain(
      'const result = await session.choose(choiceIndex, nextReaderPageIndex);',
    );
    expect(app).toContain('void recordEnding(activeStory.id, result.snapshot);');
    expect(app).not.toContain(
      'await recordEnding(activeStory.id, result.snapshot);',
    );
  });

  test('page measurement cannot paint over visible reader text during remeasurement', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).not.toContain('fallbackPageParagraphs');
    expect(app).toContain('top: -10000');
    expect(app).toContain("color: 'transparent'");
    expect(app).toContain('collapsable={false}');
    expect(app).toContain('key={`reader-page-${measurementKey}`}');
    expect(app).not.toContain(
      'key={`reader-page-${measurementKey}-${effectivePageIndex}`}',
    );
    expect(app).toContain('key={`page-${readerRevision}-${index}`}');
  });

  test('reader cursor drives text, arrows and counter from one page index', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain(
      'const [readerPageIndex, setReaderPageIndex] = useState(0);',
    );
    expect(app).toContain('clampPageIndex(readerPageIndex, pages.length)');
    expect(app).toContain('const previousPageIndex = effectivePageIndex;');
    expect(app).toContain('setReaderPageIndex(nextPageIndex);');
    expect(app).toContain('lastPageNumberRef.current = nextPageIndex + 1;');
    expect(app).toContain('key={`page-counter-${displayedPageNumber}`}');
    expect(app).toContain('{displayedPageNumber}');
    expect(app).not.toContain('const [pageNumber, setPageNumber] = useState(1);');
    expect(app).not.toContain('setPageNumber(');
    expect(app).not.toContain('`${effectivePageIndex + 1}/${pages.length}`');
    expect(app).not.toContain("readerPalette.muted}]}>\n                    …");
  });

  test('reader footer keeps the last resolved number only while measurement is pending', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain('const lastPageNumberRef = useRef(1);');
    expect(app).toContain('lastPageNumberRef.current = effectivePageIndex + 1;');
    expect(app).toContain('const displayedPageNumber = lastPageNumberRef.current;');
  });

  test('page navigation updates banner visibility before exposing the target page', () => {
    const app = source('src/app/AppV018Stable.tsx');
    const bannerUpdate = app.indexOf(
      'setPageBannerVisible(\n          nextPageOrdinal % ADS_CONFIG.bannerFrequency.pagesPerBanner === 0,',
    );
    const cursorUpdate = app.indexOf('setReaderPageIndex(nextPageIndex);');
    const persistence = app.indexOf('await session.setPage(nextPageIndex);');

    expect(bannerUpdate).toBeGreaterThan(-1);
    expect(cursorUpdate).toBeGreaterThan(bannerUpdate);
    expect(persistence).toBeGreaterThan(cursorUpdate);
    expect(app).toContain('setPageBannerVisible(previousBannerVisible);');
  });

  test('hidden native banner collapses its React spacer completely', () => {
    const yandexAds = source('src/ads/yandex/YandexAdsProvider.tsx');

    expect(yandexAds).toContain(
      'function YandexBanner({visible}: AdsBannerProps): React.JSX.Element',
    );
    expect(yandexAds).toContain(
      'height: canShowNativeBanner && visible ? reservedHeight : 0,',
    );
    expect(yandexAds).not.toContain('visible || reserveSpace');
  });

  test('choices persist page boundaries with their original choice reserve', () => {
    const app = source('src/app/AppV018Stable.tsx');
    const session = source('src/narrative/StorySession.ts');

    expect(session).toContain("export const READER_PAGE_BREAK_MARKER = '\\uE001';");
    expect(session).toContain(
      'const previousChoiceCount = this.currentSnapshot.choices.length;',
    );
    expect(session).toContain(
      '`${READER_PAGE_BREAK_MARKER}:${previousChoiceCount}`',
    );
    expect(app).toContain('let segmentStart = 0;');
    expect(app).toContain('measuredLines[index].includes(FORCED_PAGE_BREAK_MARKER)');
    expect(app).toContain('getPageBreakReserve(measuredLines[index])');
    expect(app).toContain(
      '!passage.startsWith(FORCED_PAGE_BREAK_MARKER)',
    );
  });

  test('pages mode paginates the accumulated transcript and feed-to-pages opens its end', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain('const passages = snapshot.passages');
    expect(app).toContain('if (passages.length === 0)');
    expect(app).toContain('return passages;');
    expect(app).toContain('setReaderPageIndex(Number.MAX_SAFE_INTEGER);');
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
