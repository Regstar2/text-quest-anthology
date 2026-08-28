import {
  loadStoryCatalog,
  resolveStoryCatalogAction,
  resolveStoryCatalogState,
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
  test('maps save state to start, continue and restart actions', () => {
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
    ).toBe('restart');
  });

  test('exposes explicit progress state for the card UI', () => {
    expect(resolveStoryCatalogState(FIRST_STORY, {status: 'not-found'})).toEqual({
      action: 'start',
      progress: 'not-started',
    });
    expect(
      resolveStoryCatalogState(FIRST_STORY, {
        status: 'loaded',
        save: save(FIRST_STORY),
      }),
    ).toEqual({action: 'continue', progress: 'in-progress'});
    expect(
      resolveStoryCatalogState(FIRST_STORY, {
        status: 'loaded',
        save: save(FIRST_STORY, true),
      }),
    ).toEqual({action: 'restart', progress: 'completed'});
  });

  test('does not offer continue for an incompatible content version', () => {
    expect(
      resolveStoryCatalogAction(FIRST_STORY, {
        status: 'loaded',
        save: save(FIRST_STORY, false, FIRST_STORY.contentVersion - 1),
      }),
    ).toBe('start');
  });

  test('keeps save and ending state independent for different story ids', async () => {
    const saves = new Map<string, StorySaveLoadResult>([
      [FIRST_STORY.id, {status: 'loaded', save: save(FIRST_STORY)}],
      [SECOND_STORY.id, {status: 'not-found'}],
    ]);
    const endingCounts = new Map<string, number>([
      [FIRST_STORY.id, 2],
      [SECOND_STORY.id, 0],
    ]);

    const catalog = await loadStoryCatalog(
      {listMetadata: () => [FIRST_STORY, SECOND_STORY]},
      {
        load: async storyId => saves.get(storyId) ?? {status: 'not-found'},
      },
      {
        count: async storyId => endingCounts.get(storyId) ?? 0,
      },
    );

    expect(catalog.items).toEqual([
      {
        metadata: FIRST_STORY,
        action: 'continue',
        progress: 'in-progress',
        unlockedEndingCount: 2,
      },
      {
        metadata: SECOND_STORY,
        action: 'start',
        progress: 'not-started',
        unlockedEndingCount: 0,
      },
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
      {
        count: async () => {
          throw new Error('ending storage unavailable');
        },
      },
    );

    expect(catalog.items).toEqual([
      {
        metadata: FIRST_STORY,
        action: 'start',
        progress: 'not-started',
        unlockedEndingCount: 0,
      },
    ]);
    expect(catalog.storageUnavailable).toBe(true);
  });
});
