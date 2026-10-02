import {InkStoryRuntime} from '../src/narrative/InkStoryRuntime';
import {StoryLoader, storyLoader} from '../src/narrative/StoryLoader';
import type {StoryManifestEntry} from '../src/narrative/StoryMetadata';

describe('StoryLoader', () => {
  test('loads generated metadata, compiled Ink and local asset paths by story id', () => {
    const metadata = storyLoader.listMetadata();

    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toEqual(
      expect.objectContaining({
        id: 'zavalinka',
        schemaVersion: 1,
        contentVersion: 6,
        title: 'Завалинка',
      }),
    );

    const storyPackage = storyLoader.load(metadata[0].id);
    expect(storyPackage.metadata).toBe(metadata[0]);
    expect(storyPackage.compiledStory).toBeDefined();
    expect(storyPackage.assets.cover).toBe(
      'stories/zavalinka/assets/cover.webp',
    );
  });

  test('a second package uses the same loader and narrative runtime', () => {
    const basePackage = storyLoader.load('zavalinka');
    const fixturePackage: StoryManifestEntry = {
      ...basePackage,
      metadata: {
        ...basePackage.metadata,
        id: 'fixture-story',
        title: 'Fixture Story',
      },
      assets: {
        cover: 'stories/fixture-story/assets/cover.webp',
      },
    };
    const loader = new StoryLoader([basePackage, fixturePackage]);

    expect(loader.listMetadata().map(metadata => metadata.id)).toEqual([
      'zavalinka',
      'fixture-story',
    ]);

    const runtime = new InkStoryRuntime(
      loader.load('fixture-story').compiledStory,
    );
    const snapshot = runtime.continueToChoiceOrEnd();

    expect(snapshot.choices).toHaveLength(4);
    expect(snapshot.text).toContain('Дождь начался с редких тяжёлых капель');
  });

  test('rejects unknown story ids explicitly', () => {
    expect(() => storyLoader.load('missing-story')).toThrow(
      'STORY_NOT_FOUND: Unknown story id "missing-story".',
    );
  });

  test('rejects duplicate ids in a supplied manifest', () => {
    const storyPackage = storyLoader.load('zavalinka');

    expect(() => new StoryLoader([storyPackage, storyPackage])).toThrow(
      'DUPLICATE_STORY_ID',
    );
  });
});
