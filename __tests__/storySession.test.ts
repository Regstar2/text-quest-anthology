import {StorySession} from '../src/narrative/StorySession';
import {storyLoader} from '../src/narrative/StoryLoader';
import {
  StorySaveRepository,
  type StorySave,
  type StorySaveStorage,
} from '../src/persistence/StorySaveRepository';

class MemoryStorySaveStorage implements StorySaveStorage {
  private readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }

  seed(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const STORY_PACKAGE = storyLoader.load('zavalinka');
const STORAGE_KEY = 'text-quest-anthology.story-save.zavalinka';

describe('StorySession persistence flow', () => {
  test('restores choices from a saved Ink state before a choice', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const firstOpen = await StorySession.open(STORY_PACKAGE, repository);

    expect(firstOpen.resumed).toBe(false);
    expect(firstOpen.snapshot.choices).toHaveLength(2);
    expect(firstOpen.snapshot.passages).toEqual([
      'Техническая история: свет в подъезде погас.',
    ]);
    await expect(firstOpen.session.flush()).resolves.toBe(true);

    const restored = await StorySession.open(STORY_PACKAGE, repository);

    expect(restored.resumed).toBe(true);
    expect(restored.recovery).toBeNull();
    expect(restored.snapshot.choices).toEqual(firstOpen.snapshot.choices);
    expect(restored.snapshot.passages).toEqual(firstOpen.snapshot.passages);
    expect(restored.snapshot.isEnded).toBe(false);
  });

  test('choice autosave restores Ink variables, transcript and terminal state', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const firstOpen = await StorySession.open(STORY_PACKAGE, repository);
    const result = await firstOpen.session.choose(
      firstOpen.snapshot.choices[0].index,
    );

    expect(result.persisted).toBe(true);
    expect(result.snapshot.endingId).toBe('ending_a');
    expect(result.snapshot.passages).toEqual([
      'Техническая история: свет в подъезде погас.',
      'Ты открываешь дверь и выходишь в коридор.',
    ]);

    const stored = await repository.load('zavalinka');
    expect(stored.status).toBe('loaded');

    if (stored.status !== 'loaded') {
      throw new Error('Expected autosaved story state.');
    }

    const inkState = JSON.parse(stored.save.runtimeState) as {
      variablesState?: {opened_door?: boolean};
    };
    expect(inkState.variablesState?.opened_door).toBe(true);
    expect(stored.save.readerPassages).toEqual(result.snapshot.passages);

    const restored = await StorySession.open(STORY_PACKAGE, repository);
    expect(restored.resumed).toBe(true);
    expect(restored.snapshot.choices).toHaveLength(0);
    expect(restored.snapshot.isEnded).toBe(true);
    expect(restored.snapshot.endingId).toBe('ending_a');
    expect(restored.snapshot.passages).toEqual(result.snapshot.passages);
  });

  test('legacy save without reader transcript falls back to current Ink text', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const firstOpen = await StorySession.open(STORY_PACKAGE, repository);
    const completed = await firstOpen.session.choose(
      firstOpen.snapshot.choices[1].index,
    );

    const stored = await repository.load('zavalinka');
    expect(stored.status).toBe('loaded');

    if (stored.status !== 'loaded') {
      throw new Error('Expected autosaved story state.');
    }

    const legacySave: StorySave = {
      storyId: stored.save.storyId,
      storyContentVersion: stored.save.storyContentVersion,
      runtimeState: stored.save.runtimeState,
      startedAt: stored.save.startedAt,
      updatedAt: stored.save.updatedAt,
      completed: stored.save.completed,
      endingId: stored.save.endingId,
    };
    await repository.save('zavalinka', legacySave);

    const restored = await StorySession.open(STORY_PACKAGE, repository);

    expect(restored.resumed).toBe(true);
    expect(restored.snapshot.isEnded).toBe(true);
    expect(restored.snapshot.endingId).toBe('ending_b');
    expect(restored.snapshot.passages).toEqual([completed.snapshot.text]);
  });

  test('corrupted Ink payload is reset instead of causing a crash loop', async () => {
    const storage = new MemoryStorySaveStorage();
    const repository = new StorySaveRepository(storage);
    const corruptedSave: StorySave = {
      storyId: 'zavalinka',
      storyContentVersion: STORY_PACKAGE.metadata.contentVersion,
      runtimeState: '{"brokenInkState":true}',
      startedAt: '2026-08-28T06:00:00.000Z',
      updatedAt: '2026-08-28T06:01:00.000Z',
      completed: false,
      endingId: null,
    };

    await repository.save('zavalinka', corruptedSave);

    const opened = await StorySession.open(STORY_PACKAGE, repository);

    expect(opened.resumed).toBe(false);
    expect(opened.recovery).toBe('corrupted-save-reset');
    expect(opened.snapshot.choices).toHaveLength(2);
    await expect(repository.load('zavalinka')).resolves.toEqual({
      status: 'not-found',
    });
  });

  test('incompatible contentVersion is explicitly reset', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const firstOpen = await StorySession.open(STORY_PACKAGE, repository);
    await firstOpen.session.flush();

    const stored = await repository.load('zavalinka');
    expect(stored.status).toBe('loaded');

    if (stored.status !== 'loaded') {
      throw new Error('Expected a save fixture.');
    }

    await repository.save('zavalinka', {
      ...stored.save,
      storyContentVersion: STORY_PACKAGE.metadata.contentVersion + 1,
    });

    const opened = await StorySession.open(STORY_PACKAGE, repository);

    expect(opened.resumed).toBe(false);
    expect(opened.recovery).toBe('incompatible-save-reset');
    expect(opened.snapshot.choices).toHaveLength(2);
    await expect(repository.load('zavalinka')).resolves.toEqual({
      status: 'not-found',
    });
  });

  test('restart creates a fresh runtime, transcript and save', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);
    const completed = await opened.session.choose(opened.snapshot.choices[0].index);

    expect(completed.snapshot.isEnded).toBe(true);
    expect(completed.snapshot.passages).toHaveLength(2);

    const restarted = await opened.session.restart();

    expect(restarted.persisted).toBe(true);
    expect(restarted.snapshot.isEnded).toBe(false);
    expect(restarted.snapshot.endingId).toBeNull();
    expect(restarted.snapshot.choices).toHaveLength(2);
    expect(restarted.snapshot.passages).toEqual([
      'Техническая история: свет в подъезде погас.',
    ]);

    const restored = await StorySession.open(STORY_PACKAGE, repository);
    expect(restored.resumed).toBe(true);
    expect(restored.snapshot.choices).toEqual(restarted.snapshot.choices);
    expect(restored.snapshot.passages).toEqual(restarted.snapshot.passages);
  });

  test('raw invalid JSON is handled as a corrupted save before Ink restore', async () => {
    const storage = new MemoryStorySaveStorage();
    const repository = new StorySaveRepository(storage);
    storage.seed(STORAGE_KEY, '{invalid-json');

    const opened = await StorySession.open(STORY_PACKAGE, repository);

    expect(opened.recovery).toBe('corrupted-save-reset');
    expect(opened.snapshot.choices).toHaveLength(2);
  });
});
