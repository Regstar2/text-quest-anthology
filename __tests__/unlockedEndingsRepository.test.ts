import {UnlockedEndingsRepository} from '../src/persistence/UnlockedEndingsRepository';
import type {StorySaveStorage} from '../src/persistence/StorySaveRepository';

function memoryStorage(): StorySaveStorage {
  const values = new Map<string, string>();
  return {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async key => {
      values.delete(key);
    },
  };
}

describe('UnlockedEndingsRepository', () => {
  test('records a terminal ending once and survives repository re-init', async () => {
    const storage = memoryStorage();
    const clock = () => new Date('2026-08-28T20:00:00.000Z');
    const repository = new UnlockedEndingsRepository(storage, clock);

    await repository.unlock('story-a', {
      id: 'ending-a',
      text: 'Final text A',
    });
    await repository.unlock('story-a', {
      id: 'ending-a',
      text: 'Duplicate final text',
    });

    const afterColdInit = new UnlockedEndingsRepository(storage, clock);
    await expect(afterColdInit.list('story-a')).resolves.toEqual([
      {
        id: 'ending-a',
        text: 'Final text A',
        unlockedAt: '2026-08-28T20:00:00.000Z',
      },
    ]);
  });

  test('keeps ending history independent between stories', async () => {
    const storage = memoryStorage();
    const repository = new UnlockedEndingsRepository(storage);

    await repository.unlock('story-a', {id: 'a1', text: 'A'});
    await repository.unlock('story-b', {id: 'b1', text: 'B'});

    await expect(repository.count('story-a')).resolves.toBe(1);
    await expect(repository.count('story-b')).resolves.toBe(1);
    await expect(repository.list('story-a')).resolves.toEqual([
      expect.objectContaining({id: 'a1', text: 'A'}),
    ]);
  });

  test('playthrough save deletion cannot delete ending history', async () => {
    const storage = memoryStorage();
    const repository = new UnlockedEndingsRepository(storage);

    await repository.unlock('story-a', {id: 'a1', text: 'A'});
    await storage.removeItem('text-quest-anthology.story-save.story-a');

    await expect(repository.count('story-a')).resolves.toBe(1);
  });
});
