import {
  loadStoryCatalog,
  resolveStoryCatalogAction,
} from '../src/app/StoryCatalog';
import type {StoryMetadata} from '../src/narrative/StoryMetadata';
import type {
  StorySave,
  StorySaveLoadResult,
} from '../src/persistence/StorySaveRepository';

const FIRST_STORY: StoryMetadata = {
  id: 'story-a',
  schemaVersion: 1,
  contentVersion: 3,
  title: 'Story A',
  description: 'First fixture metadata.',
  cover: 'assets/cover.webp',
};

const SECOND_STORY: StoryMetadata = {
  id: 'story-b',
  schemaVersion: 1,
  contentVersion: 2,
  title: 'Story B',
  description: 'Second fixture metadata.',
  cover: 'assets/cover.webp',
};

function save(
  metadata: StoryMetadata,
  completed = false,
  contentVersion = metadata.contentVersion,
): StorySave {
  return {
    storyId: metadata.id,
    storyContentVersion: contentVersion,
    runtimeState: '{"inkSaveVersion":10}',
    startedAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:01:00.000Z',
    completed,
    endingId: completed ? 'ending-fixture' : null,
  };
}

describe('story catalog state', () => {
  test('maps save state to start, continue and ending actions', () => {
    expect(resolveStoryCatalogAction(FIRST_STORY, {status: 'not-found'})).toBe(
      'start',
    );
    expect(
      resolveStoryCatalogAction(FIRST_STORY, {
        status: 'loaded',
        save: save(FIRST_STORY),
      }),
    ).toBe('continue');
    expect(
      resolveStoryCatalogAction(FIRST_STORY, {
        status: 'loaded',
        save: save(FIRST_STORY, true),
      }),
    ).toBe('ending');
  });

  test('does not offer continue for an incompatible content version', () => {
    expect(
      resolveStoryCatalogAction(FIRST_STORY, {
        status: 'loaded',
        save: save(FIRST_STORY, false, FIRST_STORY.contentVersion - 1),
      }),
    ).toBe('start');
  });

  test('keeps save state independent for different story ids', async () => {
    const saves = new Map<string, StorySaveLoadResult>([
      [
        FIRST_STORY.id,
        {status: 'loaded', save: save(FIRST_STORY)},
      ],
      [SECOND_STORY.id, {status: 'not-found'}],
    ]);

    const catalog = await loadStoryCatalog(
      {listMetadata: () => [FIRST_STORY, SECOND_STORY]},
      {
        load: async storyId => saves.get(storyId) ?? {status: 'not-found'},
      },
    );

    expect(catalog.items).toEqual([
      {metadata: FIRST_STORY, action: 'continue'},
      {metadata: SECOND_STORY, action: 'start'},
    ]);
    expect(catalog.storageUnavailable).toBe(false);
  });

  test('fails open when storage is unavailable', async () => {
    const catalog = await loadStoryCatalog(
      {listMetadata: () => [FIRST_STORY]},
      {
        load: async () => {
          throw new Error('storage unavailable');
        },
      },
    );

    expect(catalog.items).toEqual([{metadata: FIRST_STORY, action: 'start'}]);
    expect(catalog.storageUnavailable).toBe(true);
  });
});
