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

    expect(app).toContain(
      '? {...result.snapshot, pageIndex: Number.MAX_SAFE_INTEGER}',
    );
    expect(app).toContain('void recordEnding(activeStory.id, result.snapshot);');
    expect(app).not.toContain(
      'await recordEnding(activeStory.id, result.snapshot);',
    );
  });
});
