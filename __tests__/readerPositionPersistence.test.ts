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
}

describe('semantic reader position persistence', () => {
  test('physical page cursor persists in its lightweight sidecar with a semantic anchor', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const storyPackage = storyLoader.load('zavalinka');
    const opened = await StorySession.open(storyPackage, repository);
    const anchor = {passageIndex: 0, characterOffset: 17};

    await opened.session.flush();
    const moved = await opened.session.setPage(7, anchor);
    expect(moved.snapshot.pageIndex).toBe(7);
    expect(moved.snapshot.pageAnchor).toEqual(anchor);

    const stored = await repository.load('zavalinka');
    expect(stored.status).toBe('loaded');
    if (stored.status !== 'loaded') {
      throw new Error('Expected persisted narrative state.');
    }
    expect(stored.save.readerPageIndex).toBe(0);

    const cursor = await repository.loadReaderCursor('zavalinka');
    expect(cursor.status).toBe('loaded');
    if (cursor.status !== 'loaded') {
      throw new Error('Expected persisted reader cursor.');
    }
    expect(cursor.cursor.pageIndex).toBe(7);
    expect(cursor.cursor.pageAnchor).toEqual(anchor);

    const restored = await StorySession.open(storyPackage, repository);
    expect(restored.resumed).toBe(true);
    expect(restored.snapshot.pageIndex).toBe(7);
    expect(restored.snapshot.pageAnchor).toEqual(anchor);
  });

  test('stale cursor revision cannot override a newer narrative save', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const storyPackage = storyLoader.load('zavalinka');
    const opened = await StorySession.open(storyPackage, repository);

    await opened.session.flush();
    await repository.saveReaderCursor('zavalinka', {
      storyId: 'zavalinka',
      storyContentVersion: storyPackage.metadata.contentVersion,
      narrativeRevision: 0,
      pageIndex: 9,
      pageAnchor: {passageIndex: 0, characterOffset: 9},
    });

    const firstChoice = opened.snapshot.choices[0];
    if (!firstChoice) {
      throw new Error('Expected an initial story choice.');
    }
    await opened.session.choose(firstChoice.index);

    const restored = await StorySession.open(storyPackage, repository);
    expect(restored.resumed).toBe(true);
    expect(restored.snapshot.pageIndex).toBe(0);
    await expect(repository.loadReaderCursor('zavalinka')).resolves.toEqual({
      status: 'not-found',
    });
  });

  test('legacy save without a semantic anchor remains valid', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const storyPackage = storyLoader.load('zavalinka');
    const opened = await StorySession.open(storyPackage, repository);
    await opened.session.flush();

    const stored = await repository.load('zavalinka');
    expect(stored.status).toBe('loaded');
    if (stored.status !== 'loaded') {
      throw new Error('Expected persisted reader state.');
    }

    const legacySave: StorySave = {
      storyId: stored.save.storyId,
      storyContentVersion: stored.save.storyContentVersion,
      runtimeState: stored.save.runtimeState,
      startedAt: stored.save.startedAt,
      updatedAt: stored.save.updatedAt,
      completed: stored.save.completed,
      endingId: stored.save.endingId,
      readerCurrentText: stored.save.readerCurrentText,
      readerPassages: stored.save.readerPassages,
      readerPageIndex: stored.save.readerPageIndex,
    };
    await repository.save('zavalinka', legacySave);

    const restored = await StorySession.open(storyPackage, repository);
    expect(restored.resumed).toBe(true);
    expect(restored.snapshot.pageAnchor).toBeNull();
  });
});
