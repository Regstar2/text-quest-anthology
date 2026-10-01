import {InkStoryRuntime, type InkRuntimeSnapshot} from '../src/narrative/InkStoryRuntime';
import {StorySession, type StoryReaderSnapshot} from '../src/narrative/StorySession';
import {storyLoader} from '../src/narrative/StoryLoader';
import {
  StorySaveRepository,
  type StorySaveStorage,
} from '../src/persistence/StorySaveRepository';

const STORY_PACKAGE = storyLoader.load('zavalinka');
const EXPECTED_ENDING_IDS = [
  'e1_quiet_morning',
  'e4_together_after_bite',
  'e5_separate',
  'e6_hidden_bite',
  'e9_terrace',
  'e11_not_let_go',
  'e12_glass',
  'e15_station_together',
  'e16_station_alone',
  'e17_two_bites',
] as const;
const MAX_EXPLORED_STATES = 50000;

const CANONICAL_ROUTE = [
  'Пока не стемнело, идти к дому с целыми окнами',
  'Попробовать войти через террасу',
  'Проверить места, где кто-то мог спрятаться',
  'Укрепить низкое окно и дверь террасы',
  'Закрыть окна плотной тканью',
  'Илья остаётся дежурить',
  'Посмотреть через щель',
  'Остаться на месте',
  'Удерживать заражённого на себе и дать Лере фору',
  'Тянуть из последних сил',
  'Замереть и не издавать лишних звуков',
] as const;

const ALTERNATIVE_SURVIVAL_ROUTE = [
  'Пока не стемнело, идти к дому с целыми окнами',
  'Сначала обойти дом снаружи',
  'Проверить места, где кто-то мог спрятаться',
  'Найти и заранее проверить люк на чердак',
  'Осмотреть чердак и заранее подготовить там подручные вещи',
  'Лера дежурит первой',
  'Разбудить Илью и сразу идти к подготовленному люку',
  'Разделиться: один блокирует основное окно',
] as const;

const BEFORE_FIRST_KNOCK_ROUTE = [
  'Пока не стемнело, идти к дому с целыми окнами',
  'Попробовать войти через террасу',
  'Проверить места, где кто-то мог спрятаться',
  'Укрепить низкое окно и дверь террасы',
  'Закрыть окна плотной тканью',
] as const;

const DURING_SIEGE_ROUTE = [
  ...BEFORE_FIRST_KNOCK_ROUTE,
  'Илья остаётся дежурить',
  'Посмотреть через щель',
] as const;


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

type ExploredState = Readonly<{
  runtimeState: string;
  snapshot: InkRuntimeSnapshot;
  route: readonly string[];
}>;

function startRuntime(): {
  runtime: InkStoryRuntime;
  snapshot: InkRuntimeSnapshot;
} {
  const runtime = new InkStoryRuntime(STORY_PACKAGE.compiledStory);
  return {
    runtime,
    snapshot: runtime.continueToChoiceOrEnd(),
  };
}

function chooseRuntimeByText(
  runtime: InkStoryRuntime,
  snapshot: InkRuntimeSnapshot,
  textStart: string,
): InkRuntimeSnapshot {
  const choice = snapshot.choices.find(
    item => item.enabled && item.text.startsWith(textStart),
  );

  if (!choice) {
    throw new Error(`Expected enabled choice starting with "${textStart}".`);
  }

  return runtime.choose(choice.index);
}

function playRuntimeRoute(route: readonly string[]): InkRuntimeSnapshot {
  const {runtime, snapshot} = startRuntime();
  let current = snapshot;

  for (const choiceText of route) {
    if (current.isEnded) {
      throw new Error(
        `Route ended at ${current.endingId ?? 'unknown ending'} before "${choiceText}".`,
      );
    }
    current = chooseRuntimeByText(runtime, current, choiceText);
  }

  return current;
}

function findReaderChoice(
  snapshot: StoryReaderSnapshot,
  textStart: string,
): number {
  const choice = snapshot.choices.find(
    item => item.enabled && item.text.startsWith(textStart),
  );

  if (!choice) {
    throw new Error(`Expected enabled reader choice starting with "${textStart}".`);
  }

  return choice.index;
}

async function playSessionRoute(
  session: StorySession,
  snapshot: StoryReaderSnapshot,
  route: readonly string[],
): Promise<StoryReaderSnapshot> {
  let current = snapshot;

  for (const choiceText of route) {
    const result = await session.choose(findReaderChoice(current, choiceText));
    expect(result.persisted).toBe(true);
    current = result.snapshot;
  }

  return current;
}

function routeStateKey(
  runtimeState: string,
  snapshot: InkRuntimeSnapshot,
): string {
  const parsed = JSON.parse(runtimeState) as {
    variablesState?: unknown;
    visitCounts?: unknown;
    turnIndices?: unknown;
  };

  return JSON.stringify({
    variablesState: parsed.variablesState ?? null,
    visitCounts: parsed.visitCounts ?? null,
    turnIndices: parsed.turnIndices ?? null,
    text: snapshot.text,
    choices: snapshot.choices.map(choice => ({
      text: choice.text,
      enabled: choice.enabled,
    })),
    isEnded: snapshot.isEnded,
    endingId: snapshot.endingId,
  });
}

function declaredEndingIds(): string[] {
  const serialized = JSON.stringify(STORY_PACKAGE.compiledStory);
  return [
    ...new Set(
      [...serialized.matchAll(/ending:([A-Za-z0-9._-]+)/g)].flatMap(match =>
        match[1] ? [match[1]] : [],
      ),
    ),
  ].sort();
}

function discoverTerminalRoutes(): Map<string, readonly string[]> {
  const initial = startRuntime();
  const queue: ExploredState[] = [
    {
      runtimeState: initial.runtime.exportState(),
      snapshot: initial.snapshot,
      route: [],
    },
  ];
  const visited = new Set<string>();
  const endingRoutes = new Map<string, readonly string[]>();

  while (queue.length > 0) {
    const item = queue.pop();

    if (!item) {
      continue;
    }

    const stateKey = routeStateKey(item.runtimeState, item.snapshot);
    if (visited.has(stateKey)) {
      continue;
    }

    visited.add(stateKey);
    if (visited.size > MAX_EXPLORED_STATES) {
      throw new Error(
        `Zavalinka route exploration exceeded ${MAX_EXPLORED_STATES} unique Ink states.`,
      );
    }

    if (item.snapshot.isEnded) {
      expect(item.snapshot.choices).toHaveLength(0);
      if (!item.snapshot.endingId) {
        throw new Error(
          `Terminal route has no ending id: ${item.route.join(' -> ')}`,
        );
      }
      if (!endingRoutes.has(item.snapshot.endingId)) {
        endingRoutes.set(item.snapshot.endingId, item.route);
      }
      if (
        EXPECTED_ENDING_IDS.every(endingId => endingRoutes.has(endingId))
      ) {
        break;
      }
      continue;
    }

    const enabledChoices = item.snapshot.choices.filter(choice => choice.enabled);
    if (enabledChoices.length === 0) {
      throw new Error(
        `Non-terminal route has no enabled choices: ${item.route.join(' -> ')}`,
      );
    }

    for (const choice of enabledChoices) {
      const runtime = new InkStoryRuntime(STORY_PACKAGE.compiledStory);
      const restored = runtime.importState(item.runtimeState);
      const restoredChoice = restored.choices.find(
        candidate =>
          candidate.enabled &&
          candidate.index === choice.index &&
          candidate.text === choice.text,
      );

      if (!restoredChoice) {
        throw new Error(
          `Choice did not survive Ink state restore: "${choice.text}".`,
        );
      }

      const next = runtime.choose(restoredChoice.index);
      queue.push({
        runtimeState: runtime.exportState(),
        snapshot: next,
        route: [...item.route, choice.text],
      });
    }
  }

  return endingRoutes;
}

describe('Завалинка v0.2.8 full regression', () => {
  test('compiled package declares exactly the approved ending ids', () => {
    expect(declaredEndingIds()).toEqual([...EXPECTED_ENDING_IDS].sort());
  });

  test('all approved terminal outcomes are reachable and expose no post-ending choices', () => {
    const routes = discoverTerminalRoutes();

    expect([...routes.keys()].sort()).toEqual([...EXPECTED_ENDING_IDS].sort());
    for (const endingId of EXPECTED_ENDING_IDS) {
      expect(routes.get(endingId)?.length).toBeGreaterThan(0);
    }
  });

  test('canonical route reaches the glass ending after the attic-window sequence', () => {
    const result = playRuntimeRoute(CANONICAL_ROUTE);

    expect(result.isEnded).toBe(true);
    expect(result.choices).toHaveLength(0);
    expect(result.endingId).toBe('e12_glass');
  });

  test('prepared early-attic route keeps both survivors unbitten and reaches the station route', () => {
    const result = playRuntimeRoute(ALTERNATIVE_SURVIVAL_ROUTE);

    expect(result.isEnded).toBe(true);
    expect(result.choices).toHaveLength(0);
    expect(result.endingId).toBe('e15_station_together');
  });


  test.each([
    ['start', [] as const],
    ['before first knock', BEFORE_FIRST_KNOCK_ROUTE],
    ['during siege', DURING_SIEGE_ROUTE],
    ['late attic/escape', ALTERNATIVE_SURVIVAL_ROUTE.slice(0, -1)],
  ])('save/resume preserves the %s checkpoint exactly', async (_name, route) => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);
    const checkpoint = await playSessionRoute(
      opened.session,
      opened.snapshot,
      route,
    );

    expect(checkpoint.isEnded).toBe(false);
    expect(await opened.session.flush()).toBe(true);

    const resumed = await StorySession.open(STORY_PACKAGE, repository);
    expect(resumed.resumed).toBe(true);
    expect(resumed.recovery).toBeNull();
    expect(resumed.snapshot.isEnded).toBe(checkpoint.isEnded);
    expect(resumed.snapshot.endingId).toBe(checkpoint.endingId);
    expect(resumed.snapshot.text).toBe(checkpoint.text);
    expect(resumed.snapshot.choices).toEqual(checkpoint.choices);
  });

  test('late save and cold resume preserve the alternative survival outcome', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);
    const lateRoute = ALTERNATIVE_SURVIVAL_ROUTE.slice(0, -1);
    const lateSnapshot = await playSessionRoute(
      opened.session,
      opened.snapshot,
      lateRoute,
    );

    expect(lateSnapshot.isEnded).toBe(false);
    expect(
      lateSnapshot.choices.some(
        choice =>
          choice.enabled &&
          choice.text.startsWith(
            'Разделиться: один блокирует основное окно',
          ),
      ),
    ).toBe(true);
    expect(await opened.session.flush()).toBe(true);

    const resumed = await StorySession.open(STORY_PACKAGE, repository);
    expect(resumed.resumed).toBe(true);
    expect(resumed.recovery).toBeNull();
    expect(resumed.snapshot.text).toBe(lateSnapshot.text);
    expect(resumed.snapshot.choices).toEqual(lateSnapshot.choices);

    const finished = await resumed.session.choose(
      findReaderChoice(
        resumed.snapshot,
        'Разделиться: один блокирует основное окно',
      ),
    );

    expect(finished.persisted).toBe(true);
    expect(finished.snapshot.isEnded).toBe(true);
    expect(finished.snapshot.endingId).toBe('e15_station_together');
  });

  test('restart clears the current route and persists a fresh start state', async () => {
    const repository = new StorySaveRepository(new MemoryStorySaveStorage());
    const opened = await StorySession.open(STORY_PACKAGE, repository);
    const initialText = opened.snapshot.text;
    const initialChoices = opened.snapshot.choices;

    const progressed = await opened.session.choose(
      findReaderChoice(opened.snapshot, 'Заглянуть в дом с открытой задней дверью'),
    );
    expect(progressed.snapshot.text).not.toBe(initialText);

    const restarted = await opened.session.restart();
    expect(restarted.persisted).toBe(true);
    expect(restarted.snapshot.isEnded).toBe(false);
    expect(restarted.snapshot.text).toBe(initialText);
    expect(restarted.snapshot.choices).toEqual(initialChoices);

    const reopened = await StorySession.open(STORY_PACKAGE, repository);
    expect(reopened.resumed).toBe(true);
    expect(reopened.recovery).toBeNull();
    expect(reopened.snapshot.text).toBe(initialText);
    expect(reopened.snapshot.choices).toEqual(initialChoices);
  });
});
