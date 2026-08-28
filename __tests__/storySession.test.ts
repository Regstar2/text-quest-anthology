import {StorySession, type StoryReaderSnapshot} from '../src/narrative/StorySession';
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

function findChoice(snapshot: StoryReaderSnapshot, textStart: string): number {
  const choice = snapshot.choices.find(item => item.text.startsWith(textStart));

  if (!choice) {
    throw new Error(`Expected choice starting with "${textStart}".`);
  }

  return choice.index;
}

describe('StorySession persistence flow', () => {
  test('fresh story exposes multiple pages before the first choice', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);

    expect(opened.resumed).toBe(false);
    expect(opened.snapshot.choices).toHaveLength(2);
    expect(opened.snapshot.pageIndex).toBe(0);
    expect(opened.snapshot.pageCount).toBeGreaterThanOrEqual(4);
    expect(opened.snapshot.hasNextPage).toBe(true);
    expect(opened.snapshot.pageText).toBe(opened.snapshot.passages[0]);
  });

  test('next page persists and resumes the exact reader page', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);
    const advanced = await opened.session.nextPage();

    expect(advanced.persisted).toBe(true);
    expect(advanced.snapshot.pageIndex).toBe(1);
    expect(advanced.snapshot.pageText).toBe(advanced.snapshot.passages[1]);

    const stored = await repository.load('zavalinka');
    expect(stored.status).toBe('loaded');

    if (stored.status !== 'loaded') {
      throw new Error('Expected a saved page position.');
    }

    expect(stored.save.readerPageIndex).toBe(1);

    const restored = await StorySession.open(STORY_PACKAGE, repository);
    expect(restored.resumed).toBe(true);
    expect(restored.snapshot.pageIndex).toBe(1);
    expect(restored.snapshot.pageText).toBe(advanced.snapshot.pageText);
    expect(restored.snapshot.choices).toEqual(advanced.snapshot.choices);
  });

  test('page navigation stops at the current text block boundary', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);
    let snapshot = opened.snapshot;

    while (snapshot.hasNextPage) {
      snapshot = (await opened.session.nextPage()).snapshot;
    }

    expect(snapshot.pageIndex).toBe(snapshot.pageCount - 1);
    expect(snapshot.choices).toHaveLength(2);
    await expect(opened.session.nextPage()).rejects.toThrow('READER_PAGE_END');
  });

  test('choice starts a new page block and keeps the feed transcript', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);
    const initialPassageCount = opened.snapshot.passages.length;
    const result = await opened.session.choose(
      findChoice(opened.snapshot, 'Подойти к двери'),
    );

    expect(result.persisted).toBe(true);
    expect(result.snapshot.isEnded).toBe(false);
    expect(result.snapshot.pageIndex).toBe(0);
    expect(result.snapshot.pageCount).toBeGreaterThanOrEqual(3);
    expect(result.snapshot.choices).toHaveLength(3);
    expect(result.snapshot.passages.length).toBeGreaterThan(initialPassageCount);
    expect(result.snapshot.pageText).toBe(
      result.snapshot.passages[initialPassageCount],
    );
  });

  test('terminal choice autosaves ending and transcript', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);
    const nearDoor = await opened.session.choose(
      findChoice(opened.snapshot, 'Подойти к двери'),
    );
    const completed = await opened.session.choose(
      findChoice(nearDoor.snapshot, 'Открыть дверь'),
    );

    expect(completed.snapshot.isEnded).toBe(true);
    expect(completed.snapshot.endingId).toBe('ending_open');
    expect(completed.snapshot.text).toContain('площадке');

    const stored = await repository.load('zavalinka');
    expect(stored.status).toBe('loaded');

    if (stored.status !== 'loaded') {
      throw new Error('Expected autosaved terminal story state.');
    }

    expect(stored.save.completed).toBe(true);
    expect(stored.save.endingId).toBe('ending_open');
    expect(stored.save.readerPassages).toEqual(completed.snapshot.passages);
  });

  test('legacy save without page index resumes at the end of its text block', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);
    const nearDoor = await opened.session.choose(
      findChoice(opened.snapshot, 'Подойти к двери'),
    );

    const stored = await repository.load('zavalinka');
    expect(stored.status).toBe('loaded');

    if (stored.status !== 'loaded') {
      throw new Error('Expected a save fixture.');
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
    expect(restored.snapshot.pageIndex).toBe(restored.snapshot.pageCount - 1);
    expect(restored.snapshot.pageText).toBe(
      nearDoor.snapshot.passages[nearDoor.snapshot.passages.length - 1],
    );
    expect(restored.snapshot.choices).toHaveLength(3);
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
    expect(opened.snapshot.pageIndex).toBe(0);
    await expect(repository.load('zavalinka')).resolves.toEqual({
      status: 'not-found',
    });
  });

  test('incompatible contentVersion is explicitly reset', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);
    await opened.session.flush();

    const stored = await repository.load('zavalinka');
    expect(stored.status).toBe('loaded');

    if (stored.status !== 'loaded') {
      throw new Error('Expected a save fixture.');
    }

    await repository.save('zavalinka', {
      ...stored.save,
      storyContentVersion: STORY_PACKAGE.metadata.contentVersion + 1,
    });

    const restored = await StorySession.open(STORY_PACKAGE, repository);

    expect(restored.resumed).toBe(false);
    expect(restored.recovery).toBe('incompatible-save-reset');
    expect(restored.snapshot.pageIndex).toBe(0);
    await expect(repository.load('zavalinka')).resolves.toEqual({
      status: 'not-found',
    });
  });

  test('restart resets runtime, transcript and page position', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);
    await opened.session.nextPage();
    await opened.session.choose(findChoice(opened.snapshot, 'Подойти к двери'));

    const restarted = await opened.session.restart();

    expect(restarted.persisted).toBe(true);
    expect(restarted.snapshot.isEnded).toBe(false);
    expect(restarted.snapshot.endingId).toBeNull();
    expect(restarted.snapshot.choices).toHaveLength(2);
    expect(restarted.snapshot.pageIndex).toBe(0);
    expect(restarted.snapshot.passages).toHaveLength(restarted.snapshot.pageCount);

    const restored = await StorySession.open(STORY_PACKAGE, repository);
    expect(restored.resumed).toBe(true);
    expect(restored.snapshot.pageIndex).toBe(0);
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
