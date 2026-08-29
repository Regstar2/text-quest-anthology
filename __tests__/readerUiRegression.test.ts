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
  return fs.readFileSync(pathModule.join(processModule.cwd(), path), 'utf8');
}

describe('v0.1.8 reader UI regressions', () => {
  test('interaction dock is only mounted on the active choice or ending page', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain('{isInteractionPage ? (');
    expect(app).not.toContain('interactionDockHidden');
    expect(app).toContain('isEndingPage ? renderEndingActions() : renderChoices(true)');
  });

  test('terminal transition opens the ending page without blocking on history storage', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain('pageIndex: Number.MAX_SAFE_INTEGER');
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
    expect(app).toContain('key={`reader-page-${measurementKey}-${effectivePageIndex}`}');
  });

  test('reader footer derives its number from the actual stable page index', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain('{effectivePageIndex + 1}');
    expect(app).not.toContain('const [pageNumber, setPageNumber] = useState(1);');
    expect(app).not.toContain('setPageNumber(');
    expect(app).not.toContain('`${effectivePageIndex + 1}/${pages.length}`');
    expect(app).not.toContain("readerPalette.muted}]}>\n                    …");
  });

  test('page mode reserves banner height so ad visibility cannot repaginate the text', () => {
    const app = source('src/app/AppV018Stable.tsx');
    const yandexAds = source('src/ads/yandex/YandexAdsProvider.tsx');

    expect(app).toMatch(
      /reserveSpace=\{screen === 'reader' && readerMode === 'pages'\}/,
    );
    expect(yandexAds).toContain('reserveSpace = false');
    expect(yandexAds).toMatch(
      /canShowNativeBanner && \(visible \|\| reserveSpace\) \? reservedHeight : 0/,
    );
  });

  test('choices persist page boundaries and page mode handles more than one boundary', () => {
    const app = source('src/app/AppV018Stable.tsx');
    const session = source('src/narrative/StorySession.ts');

    expect(session).toContain("export const READER_PAGE_BREAK_MARKER = '\\uE001';");
    expect(session).toContain('this.readerPassages.push(READER_PAGE_BREAK_MARKER);');
    expect(app).toContain('let segmentStart = 0;');
    expect(app).toContain('measuredLines[index].includes(FORCED_PAGE_BREAK_MARKER)');
    expect(app).toContain(
      '.filter(passage => passage !== FORCED_PAGE_BREAK_MARKER)',
    );
  });

  test('pages mode paginates the accumulated transcript and feed-to-pages opens its end', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain('const passages = snapshot.passages');
    expect(app).toContain('if (passages.length === 0)');
    expect(app).toContain('return passages;');
    expect(app).toContain('setSnapshot({...snapshot, pageIndex: Number.MAX_SAFE_INTEGER});');
    expect(app).toMatch(
      /readerMode === 'pages' \|\| result\.snapshot\.isEnded\s+\? \{\.\.\.result\.snapshot, pageIndex: Number\.MAX_SAFE_INTEGER\}/,
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
