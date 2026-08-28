import {
  StorySaveRepository,
  type StorySave,
} from '../src/persistence/StorySaveRepository';
import {MemoryStorySaveStorage} from './helpers/MemoryStorySaveStorage';

const storageKey = (storyId: string) =>
  `text-quest-anthology.story-save.${storyId}`;

function makeSave(storyId: string): StorySave {
  return {
    storyId,
    storyContentVersion: 1,
    runtimeState: '{"inkSave":true}',
    startedAt: '2026-08-28T06:00:00.000Z',
    updatedAt: '2026-08-28T06:05:00.000Z',
    completed: false,
    endingId: null,
  };
}

describe('StorySaveRepository', () => {
  test('save -> load round trip preserves the save contract', async () => {
    const storage = new MemoryStorySaveStorage();
    const repository = new StorySaveRepository(storage);
    const save = makeSave('story-a');

    await repository.save('story-a', save);

    await expect(repository.load('story-a')).resolves.toEqual({
      status: 'loaded',
      save,
    });
  });

  test('corrupted payload is distinct from a missing save', async () => {
    const storage = new MemoryStorySaveStorage();
    const repository = new StorySaveRepository(storage);

    storage.seed(storageKey('story-a'), '{not-json');

    await expect(repository.load('story-a')).resolves.toEqual({
      status: 'corrupted',
      reason: 'invalid-json',
    });
    await expect(repository.load('story-b')).resolves.toEqual({
      status: 'not-found',
    });
  });

  test('payload stored under a different story id is rejected', async () => {
    const storage = new MemoryStorySaveStorage();
    const repository = new StorySaveRepository(storage);

    storage.seed(storageKey('story-a'), JSON.stringify(makeSave('story-b')));

    await expect(repository.load('story-a')).resolves.toEqual({
      status: 'corrupted',
      reason: 'story-id-mismatch',
    });
  });

  test('reset deletes only the selected story id', async () => {
    const storage = new MemoryStorySaveStorage();
    const repository = new StorySaveRepository(storage);
    const firstSave = makeSave('story-a');
    const secondSave = makeSave('story-b');

    await repository.save('story-a', firstSave);
    await repository.save('story-b', secondSave);
    await repository.delete('story-a');

    await expect(repository.load('story-a')).resolves.toEqual({
      status: 'not-found',
    });
    await expect(repository.load('story-b')).resolves.toEqual({
      status: 'loaded',
      save: secondSave,
    });
  });
});
