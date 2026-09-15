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
  test('physical page cursor persists together with a semantic anchor', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const storyPackage = storyLoader.load('zavalinka');
    const opened = await StorySession.open(storyPackage, repository);
    const anchor = {passageIndex: 0, characterOffset: 17};

    const moved = await opened.session.setPage(2, anchor);
    expect(moved.snapshot.pageIndex).toBe(2);
    expect(moved.snapshot.pageAnchor).toEqual(anchor);

    const stored = await repository.load('zavalinka');
    expect(stored.status).toBe('loaded');
    if (stored.status !== 'loaded') {
      throw new Error('Expected persisted reader position.');
    }
    expect(stored.save.readerPageIndex).toBe(2);
    expect(stored.save.readerPageAnchor).toEqual(anchor);

    const restored = await StorySession.open(storyPackage, repository);
    expect(restored.resumed).toBe(true);
    expect(restored.snapshot.pageIndex).toBe(2);
    expect(restored.snapshot.pageAnchor).toEqual(anchor);
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
