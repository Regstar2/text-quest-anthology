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

describe('v0.1.8 architecture gate', () => {
  test('application navigation remains data-driven and story-agnostic', () => {
    const app = source('src/app/AppV018.tsx');

    expect(app).toContain('storyLoader.listMetadata()');
    expect(app).toContain('storyLoader.load(storyId)');
    expect(app).not.toContain('DEFAULT_STORY');
    expect(app).not.toContain("storyId === 'zavalinka'");
    expect(app).not.toContain('storyId === "zavalinka"');
  });

  test('reader preferences and ending history stay outside Ink state', () => {
    const app = source('src/app/AppV018.tsx');
    const session = source('src/narrative/StorySession.ts');

    expect(app).toContain('readerPreferencesRepository');
    expect(app).toContain('unlockedEndingsRepository');
    expect(session).not.toMatch(/ReaderPreferences|UnlockedEndings/i);
  });

  test('selected theme is shared by the app shell and reader', () => {
    const app = source('src/app/AppV018.tsx');
    const strings = source('src/config/uiStrings.ts');

    expect(app).toContain('const appColors: AppColors = readerPalette;');
    expect(app).toContain('const statusBarStyle = readerPalette.statusBar;');
    expect(strings).toContain("readerThemeLabel: 'Тема приложения'");
  });

  test('locked choices are rendered from runtime state without story-specific conditions', () => {
    const app = source('src/app/AppV018.tsx');

    expect(app).toContain('choice.enabled');
    expect(app).toContain('🔒');
    expect(app).not.toMatch(/gas|pipe|чердак|zavalinka/i);
  });

  test('narrative and persistence core do not depend on ad or store SDKs', () => {
    const core = [
      source('src/narrative/InkStoryRuntime.ts'),
      source('src/narrative/StoryLoader.ts'),
      source('src/narrative/StorySession.ts'),
      source('src/persistence/StorySaveRepository.ts'),
    ].join('\n');

    expect(core).not.toMatch(/yandex-mobile-ads|YandexAdsProvider/i);
    expect(core).not.toMatch(/rustore|appgallery|getapps/i);
  });

  test('there is only one narrative engine boundary', () => {
    const runtime = source('src/narrative/InkStoryRuntime.ts');
    const session = source('src/narrative/StorySession.ts');

    expect(runtime).toMatch(/inkjs/i);
    expect(session).not.toMatch(/JSON narrative|custom narrative engine/i);
  });

  test('Yandex banner stays outside the React Native Fabric view tree', () => {
    const reactAdsProvider = source('src/ads/yandex/YandexAdsProvider.tsx');
    const androidActivity = source(
      'android/app/src/main/java/io/github/regstar2/textquestanthology/MainActivity.kt',
    );

    expect(reactAdsProvider).not.toMatch(/BannerView|BannerAdSize/);
    expect(reactAdsProvider).toContain('NativeBannerController');
    expect(androidActivity).toContain('BannerAdView');
    expect(androidActivity).toContain('BannerAdSize.inline');
  });
});
