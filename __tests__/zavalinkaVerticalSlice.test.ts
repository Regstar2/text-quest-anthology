import {StorySession, type StoryReaderSnapshot} from '../src/narrative/StorySession';
import {storyLoader} from '../src/narrative/StoryLoader';
import {
  StorySaveRepository,
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

const STORY_PACKAGE = storyLoader.load('zavalinka');

function findChoice(snapshot: StoryReaderSnapshot, textStart: string): number {
  const choice = snapshot.choices.find(
    item => item.enabled && item.text.startsWith(textStart),
  );
  if (!choice) {
    throw new Error(`Expected enabled choice starting with "${textStart}".`);
  }
  return choice.index;
}

function readVariables(runtimeState: string): Record<string, unknown> {
  const parsed = JSON.parse(runtimeState) as {
    variablesState?: Record<string, unknown>;
  };
  return parsed.variablesState ?? {};
}

async function loadVariables(
  repository: StorySaveRepository,
): Promise<Record<string, unknown>> {
  const saved = await repository.load('zavalinka');
  expect(saved.status).toBe('loaded');
  if (saved.status !== 'loaded') {
    throw new Error('Expected a persisted Zavalinka save.');
  }
  return readVariables(saved.save.runtimeState);
}

describe('Завалинка v0.2.0 known routes', () => {
  test('canonical route reaches preparation after a normal house inspection', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);

    let current = await opened.session.choose(
      findChoice(opened.snapshot, 'Пока не стемнело, идти к дому'),
    );
    current = await opened.session.choose(
      findChoice(current.snapshot, 'Попробовать войти через террасу'),
    );
    current = await opened.session.choose(
      findChoice(current.snapshot, 'Проверить места, где кто-то мог спрятаться'),
    );

    const variables = await loadVariables(repository);
    expect(variables.DETOUR_COUNT).toBe(0);
    expect(variables.PIPE_KNOWN).toBe(false);
    expect(variables.HATCH_SPOTTED).toBe(false);
    expect(variables.HATCH_PREPARED).toBe(false);
    expect(variables.PREP_ACTIONS_LEFT).toBe(2);

    expect(
      current.snapshot.choices.some(
        choice =>
          choice.enabled &&
          choice.text.startsWith('Найти и заранее подготовить люк'),
      ),
    ).toBe(true);
  });

  test('early open-door detour persists HAMMER and reduces preparation time', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);

    const afterDetour = await opened.session.choose(
      findChoice(opened.snapshot, 'Заглянуть в дом с открытой задней дверью'),
    );

    let variables = await loadVariables(repository);
    expect(variables.DETOUR_COUNT).toBe(1);
    expect(variables.HAMMER).toBe(true);

    const resumed = await StorySession.open(STORY_PACKAGE, repository);
    expect(resumed.resumed).toBe(true);
    expect(resumed.snapshot.text).toBe(afterDetour.snapshot.text);

    let current = await resumed.session.choose(
      findChoice(resumed.snapshot, 'Попробовать войти через террасу'),
    );
    current = await resumed.session.choose(
      findChoice(current.snapshot, 'Проверить места, где кто-то мог спрятаться'),
    );

    variables = await loadVariables(repository);
    expect(variables.DETOUR_COUNT).toBe(1);
    expect(variables.HAMMER).toBe(true);
    expect(variables.HATCH_SPOTTED).toBe(false);
    expect(variables.PREP_ACTIONS_LEFT).toBe(1);
  });

  test('thorough inspection prepares the hatch and changes later preparation choices', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);

    let current = await opened.session.choose(
      findChoice(opened.snapshot, 'Пока не стемнело, идти к дому'),
    );
    current = await opened.session.choose(
      findChoice(current.snapshot, 'Попробовать войти через террасу'),
    );
    current = await opened.session.choose(
      findChoice(current.snapshot, 'Не торопиться и осмотреть дом сверху донизу'),
    );

    const variables = await loadVariables(repository);
    expect(variables.DETOUR_COUNT).toBe(0);
    expect(variables.HATCH_SPOTTED).toBe(true);
    expect(variables.HATCH_PREPARED).toBe(true);
    expect(variables.PREP_ACTIONS_LEFT).toBe(1);

    expect(
      current.snapshot.choices.some(choice =>
        choice.text.startsWith('Найти и заранее подготовить люк'),
      ),
    ).toBe(false);
    expect(
      current.snapshot.choices.some(
        choice =>
          choice.enabled &&
          choice.text.startsWith('Осмотреть чердак и подготовить вещи'),
      ),
    ).toBe(true);
  });
});
