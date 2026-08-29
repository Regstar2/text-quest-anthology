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

  test('reader footer uses a logical page number that is independent of layout reflow', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain('const [pageNumber, setPageNumber] = useState(1);');
    expect(app).toContain('{pageNumber}');
    expect(app).toContain('setPageNumber(previous => previous + 1);');
    expect(app).toContain('const pageDelta = nextPageIndex - previousPageIndex;');
    expect(app).toContain(
      'setPageNumber(previous => Math.max(1, previous + pageDelta));',
    );
    expect(app).not.toContain('`${effectivePageIndex + 1}/${pages.length}`');
    expect(app).not.toContain("readerPalette.muted}]}>\n                    …");
  });

  test('feed choices advance the logical page number before mode-specific ad cadence', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toMatch(
      /setNotice\(result\.persisted \? null : UI_STRINGS\.saveFailed\);\s+setPageNumber\(previous => previous \+ 1\);\s+if \(readerMode === 'pages'\)/,
    );
    expect(app).toContain('setSnapshot({...snapshot, pageIndex: Number.MAX_SAFE_INTEGER});');
  });

  test('pages mode paginates the accumulated transcript and feed-to-pages opens its end', () => {
    const app = source('src/app/AppV018Stable.tsx');

    expect(app).toContain('const passages = snapshot.passages');
    expect(app).toContain('return passages.length > 0 ? passages : splitParagraphs(snapshot.text);');
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
