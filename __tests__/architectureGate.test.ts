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

describe('v0.1.7 architecture gate', () => {
  test('application navigation does not hardcode Zavalinka as the selected story', () => {
    const app = source('src/app/App.tsx');

    expect(app).toContain('storyLoader.listMetadata()');
    expect(app).toContain('storyLoader.load(storyId)');
    expect(app).not.toContain('DEFAULT_STORY');
    expect(app).not.toContain("storyId === 'zavalinka'");
    expect(app).not.toContain('storyId === "zavalinka"');
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
