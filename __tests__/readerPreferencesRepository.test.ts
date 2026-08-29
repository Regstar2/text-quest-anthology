import {
  DEFAULT_READER_PREFERENCES,
  ReaderPreferencesRepository,
} from '../src/persistence/ReaderPreferencesRepository';
import type {StorySaveStorage} from '../src/persistence/StorySaveRepository';

function memoryStorage(): Readonly<{
  storage: StorySaveStorage;
  values: Map<string, string>;
}> {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: async key => values.get(key) ?? null,
      setItem: async (key, value) => {
        values.set(key, value);
      },
      removeItem: async key => {
        values.delete(key);
      },
    },
  };
}

describe('ReaderPreferencesRepository', () => {
  test('returns defaults when no preferences exist', async () => {
    const {storage} = memoryStorage();
    const repository = new ReaderPreferencesRepository(storage);

    await expect(repository.load()).resolves.toEqual(DEFAULT_READER_PREFERENCES);
  });

  test('persists mode and theme across a cold repository re-init', async () => {
    const {storage} = memoryStorage();
    const first = new ReaderPreferencesRepository(storage);

    await first.save({mode: 'feed', theme: 'sepia'});

    const afterColdInit = new ReaderPreferencesRepository(storage);
    await expect(afterColdInit.load()).resolves.toEqual({
      mode: 'feed',
      theme: 'sepia',
    });
  });

  test('falls back safely for malformed payloads', async () => {
    const {storage, values} = memoryStorage();
    values.set('text-quest-anthology.reader-preferences.v1', '{broken');

    const repository = new ReaderPreferencesRepository(storage);
    await expect(repository.load()).resolves.toEqual(DEFAULT_READER_PREFERENCES);
  });
});
