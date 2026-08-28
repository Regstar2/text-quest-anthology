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
  const choice = snapshot.choices.find(item => item.text.startsWith(textStart));
  if (!choice) {
    throw new Error(`Expected choice starting with "${textStart}".`);
  }
  return choice.index;
}

function readFlag(runtimeState: string, flag: string): unknown {
  const parsed = JSON.parse(runtimeState) as {
    variablesState?: Record<string, unknown>;
  };
  return parsed.variablesState?.[flag];
}

describe('Завалинка vertical slice known routes', () => {
  test('route A restores early PIPE_KNOWN, exposes its delayed consequence and reaches e7_attic_dawn', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);

    const afterPipeCheck = await opened.session.choose(
      findChoice(opened.snapshot, 'Сначала обойти дом'),
    );

    const savedAfterFlag = await repository.load('zavalinka');
    expect(savedAfterFlag.status).toBe('loaded');
    if (savedAfterFlag.status !== 'loaded') {
      throw new Error('Expected save after early flag-setting choice.');
    }
    expect(readFlag(savedAfterFlag.save.runtimeState, 'PIPE_KNOWN')).toBe(true);

    const resumedAfterFlag = await StorySession.open(STORY_PACKAGE, repository);
    expect(resumedAfterFlag.resumed).toBe(true);
    expect(resumedAfterFlag.snapshot.text).toBe(afterPipeCheck.snapshot.text);

    let current = await resumedAfterFlag.session.choose(
      findChoice(resumedAfterFlag.snapshot, 'Осмотреть дом тщательно'),
    );
    current = await resumedAfterFlag.session.choose(
      findChoice(current.snapshot, 'Укрепить вход'),
    );

    expect(
      current.snapshot.choices.some(choice =>
        choice.text.startsWith('Не подходить к окну'),
      ),
    ).toBe(true);

    current = await resumedAfterFlag.session.choose(
      findChoice(current.snapshot, 'Не подходить к окну'),
    );

    const savedBeforeConsequence = await repository.load('zavalinka');
    expect(savedBeforeConsequence.status).toBe('loaded');
    if (savedBeforeConsequence.status !== 'loaded') {
      throw new Error('Expected save before delayed attic consequence.');
    }
    expect(readFlag(savedBeforeConsequence.save.runtimeState, 'PIPE_KNOWN')).toBe(true);
    expect(readFlag(savedBeforeConsequence.save.runtimeState, 'BARRICADE')).toBe(true);

    const resumedBeforeConsequence = await StorySession.open(
      STORY_PACKAGE,
      repository,
    );
    expect(resumedBeforeConsequence.resumed).toBe(true);
    expect(
      resumedBeforeConsequence.snapshot.choices.some(choice =>
        choice.text.startsWith('Сразу заблокировать маленькое окно'),
      ),
    ).toBe(true);

    const completed = await resumedBeforeConsequence.session.choose(
      findChoice(
        resumedBeforeConsequence.snapshot,
        'Сразу заблокировать маленькое окно',
      ),
    );

    expect(completed.snapshot.isEnded).toBe(true);
    expect(completed.snapshot.endingId).toBe('e7_attic_dawn');

    const completedSave = await repository.load('zavalinka');
    expect(completedSave.status).toBe('loaded');
    if (completedSave.status !== 'loaded') {
      throw new Error('Expected completed route A save.');
    }
    expect(readFlag(completedSave.save.runtimeState, 'WINDOW_SECURED')).toBe(true);
  });

  test('route B keeps PIPE_KNOWN false, hides the delayed pipe action and reaches e12_glass', async () => {
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

    const saved = await repository.load('zavalinka');
    expect(saved.status).toBe('loaded');
    if (saved.status !== 'loaded') {
      throw new Error('Expected route B save.');
    }
    expect(readFlag(saved.save.runtimeState, 'PIPE_KNOWN')).toBe(false);
    expect(
      current.snapshot.choices.some(choice =>
        choice.text.startsWith('Сразу заблокировать маленькое окно'),
      ),
    ).toBe(false);

    const completed = await opened.session.choose(
      findChoice(current.snapshot, 'Остаться у люка'),
    );

    expect(completed.snapshot.isEnded).toBe(true);
    expect(completed.snapshot.endingId).toBe('e12_glass');
  });
});
