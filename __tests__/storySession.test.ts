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
  test('fresh story exposes full current block and first choice set', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);

    expect(opened.resumed).toBe(false);
    expect(opened.snapshot.pageIndex).toBe(0);
    expect(opened.snapshot.choices).toHaveLength(2);
    expect(opened.snapshot.text).toContain('Ливень начался не сразу');
    expect(opened.snapshot.text).toContain('маленький Г-образный дом');
  });

  test('page index and full current text survive cold resume', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);
    const expectedText = opened.snapshot.text;
    const moved = await opened.session.setPage(1);

    expect(moved.persisted).toBe(true);
    expect(moved.snapshot.pageIndex).toBe(1);

    const stored = await repository.load('zavalinka');
    expect(stored.status).toBe('loaded');
    if (stored.status !== 'loaded') {
      throw new Error('Expected saved reader state.');
    }
    expect(stored.save.readerPageIndex).toBe(1);
    expect(stored.save.readerCurrentText).toBe(expectedText);

    const restored = await StorySession.open(STORY_PACKAGE, repository);
    expect(restored.resumed).toBe(true);
    expect(restored.snapshot.pageIndex).toBe(1);
    expect(restored.snapshot.text).toBe(expectedText);
    expect(restored.snapshot.choices).toEqual(opened.snapshot.choices);
  });

  test('invalid page indexes are rejected', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);

    await expect(opened.session.setPage(-1)).rejects.toThrow('READER_PAGE_INVALID');
    await expect(opened.session.setPage(1.5)).rejects.toThrow('READER_PAGE_INVALID');
  });

  test('choice starts a new text block at page zero and keeps feed transcript', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);
    await opened.session.setPage(1);
    const initialPassageCount = opened.snapshot.passages.length;

    const result = await opened.session.choose(
      findChoice(opened.snapshot, 'Зайти в дом сразу'),
    );

    expect(result.persisted).toBe(true);
    expect(result.snapshot.pageIndex).toBe(0);
    expect(result.snapshot.isEnded).toBe(false);
    expect(result.snapshot.choices).toHaveLength(2);
    expect(result.snapshot.text).toContain('Внутри тихо');
    expect(result.snapshot.passages.length).toBeGreaterThan(initialPassageCount);
  });

  test('terminal choice autosaves ending, current text and transcript', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);

    let current = await opened.session.choose(
      findChoice(opened.snapshot, 'Зайти в дом сразу'),
    );
    current = await opened.session.choose(
      findChoice(current.snapshot, 'Осмотреть дом тщательно'),
    );
    current = await opened.session.choose(
      findChoice(current.snapshot, 'Укрепить вход'),
    );
    current = await opened.session.choose(
      findChoice(current.snapshot, 'Не подходить к окну'),
    );
    const completed = await opened.session.choose(
      findChoice(current.snapshot, 'Остаться у люка'),
    );

    expect(completed.snapshot.isEnded).toBe(true);
    expect(completed.snapshot.endingId).toBe('e12_glass');
    expect(completed.snapshot.text).toContain('Третий удар выбивает стекло');

    const stored = await repository.load('zavalinka');
    expect(stored.status).toBe('loaded');
    if (stored.status !== 'loaded') {
      throw new Error('Expected autosaved terminal state.');
    }
    expect(stored.save.completed).toBe(true);
    expect(stored.save.readerCurrentText).toBe(completed.snapshot.text);
    expect(stored.save.readerPassages).toEqual(completed.snapshot.passages);
  });

  test('legacy save without reader fields remains loadable', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);
    await opened.session.flush();

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
    expect(restored.snapshot.pageIndex).toBe(0);
    expect(restored.snapshot.choices).toHaveLength(2);
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
    await expect(repository.load('zavalinka')).resolves.toEqual({status: 'not-found'});
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
  });

  test('restart resets runtime, transcript and page position', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);
    await opened.session.setPage(2);
    await opened.session.choose(findChoice(opened.snapshot, 'Зайти в дом сразу'));

    const restarted = await opened.session.restart();
    expect(restarted.persisted).toBe(true);
    expect(restarted.snapshot.pageIndex).toBe(0);
    expect(restarted.snapshot.isEnded).toBe(false);
    expect(restarted.snapshot.choices).toHaveLength(2);
    expect(restarted.snapshot.text).toContain('Ливень начался не сразу');
  });

  test('raw invalid JSON is handled as corrupted save before Ink restore', async () => {
    const storage = new MemoryStorySaveStorage();
    const repository = new StorySaveRepository(storage);
    storage.seed(STORAGE_KEY, '{invalid-json');

    const opened = await StorySession.open(STORY_PACKAGE, repository);
    expect(opened.recovery).toBe('corrupted-save-reset');
  });
});
