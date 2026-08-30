import {Compiler} from 'inkjs/full';
import {
  InkStoryRuntime,
  type InkRuntimeSnapshot,
  type InkStoryContent,
} from '../src/narrative/InkStoryRuntime';
import {storyLoader} from '../src/narrative/StoryLoader';

const STORY_METADATA = storyLoader.listMetadata()[0];

if (!STORY_METADATA) {
  throw new Error('Expected at least one generated story fixture.');
}

function startStory(): {
  runtime: InkStoryRuntime;
  snapshot: InkRuntimeSnapshot;
} {
  const storyPackage = storyLoader.load(STORY_METADATA.id);
  const runtime = new InkStoryRuntime(storyPackage.compiledStory);
  return {
    runtime,
    snapshot: runtime.continueToChoiceOrEnd(),
  };
}

function startChoiceOptionFixture(): {
  runtime: InkStoryRuntime;
  snapshot: InkRuntimeSnapshot;
} {
  const compiler = new Compiler(`
Fixture. # choice-option:0:Закрытый вариант
* {false} [Закрытый вариант] -> done
* [Доступный вариант] -> done

=== done ===
# ending:fixture_end
-> END
`);
  const story = compiler.Compile();
  if (!story) {
    throw new Error('Expected inline Ink fixture to compile.');
  }

  const runtime = new InkStoryRuntime(
    JSON.parse(story.ToJson()) as InkStoryContent,
  );
  return {
    runtime,
    snapshot: runtime.continueToChoiceOrEnd(),
  };
}

function chooseByText(
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

describe('InkStoryRuntime packaged story', () => {
  test('v0.2.0 prepared route exposes delayed hatch choices and reaches a terminal state', () => {
    const {runtime, snapshot} = startStory();

    expect(snapshot.isEnded).toBe(false);
    expect(snapshot.choices).toHaveLength(4);
    expect(snapshot.choices.every(choice => choice.enabled)).toBe(true);
    expect(snapshot.text).toContain('Дождь начался с редких тяжёлых капель');

    let current = chooseByText(
      runtime,
      snapshot,
      'Пока не стемнело, идти к дому',
    );
    current = chooseByText(runtime, current, 'Сначала обойти дом снаружи');
    current = chooseByText(
      runtime,
      current,
      'Не торопиться и осмотреть дом сверху донизу',
    );

    expect(current.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          enabled: true,
          text: expect.stringContaining('Осмотреть чердак и подготовить вещи'),
        }),
      ]),
    );

    current = chooseByText(
      runtime,
      current,
      'Осмотреть чердак и подготовить вещи',
    );
    current = chooseByText(runtime, current, 'Лера дежурит первой');

    expect(current.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          enabled: true,
          text: expect.stringContaining('сразу идти к подготовленному люку'),
        }),
      ]),
    );

    current = chooseByText(
      runtime,
      current,
      'Приоткрыть ткань и посмотреть наружу',
    );
    expect(current.choices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          enabled: true,
          text: expect.stringContaining('Уходить на чердак прямо сейчас'),
        }),
      ]),
    );

    const result = chooseByText(runtime, current, 'Рвануть к террасе');
    expect(result.isEnded).toBe(true);
    expect(result.choices).toHaveLength(0);
    expect(result.endingId).toBe('e9_terrace');
  });

  test('unavailable conditional choices are exposed without becoming selectable', () => {
    const {snapshot} = startChoiceOptionFixture();

    expect(snapshot.choices).toEqual([
      {
        enabled: false,
        index: -1,
        text: 'Закрытый вариант',
      },
      expect.objectContaining({
        enabled: true,
        text: 'Доступный вариант',
      }),
    ]);
  });

  test('unavailable conditional choice survives Ink state restore', () => {
    const {runtime, snapshot} = startChoiceOptionFixture();
    const serializedState = runtime.exportState();

    const restoredFixture = startChoiceOptionFixture();
    const restored = restoredFixture.runtime.importState(serializedState);

    expect(restored.choices).toEqual(snapshot.choices);
    expect(restored.choices[0]).toEqual({
      enabled: false,
      index: -1,
      text: 'Закрытый вариант',
    });
  });

  test('Ink state is serializable and restores the current decision point', () => {
    const {runtime, snapshot} = startStory();
    let current = chooseByText(
      runtime,
      snapshot,
      'Пока не стемнело, идти к дому',
    );
    const afterPipeCheck = chooseByText(
      runtime,
      current,
      'Сначала обойти дом снаружи',
    );
    const serializedState = runtime.exportState();

    expect(() => JSON.parse(serializedState)).not.toThrow();

    const restoredStory = storyLoader.load(STORY_METADATA.id);
    const restoredRuntime = new InkStoryRuntime(restoredStory.compiledStory);
    const restoredSnapshot = restoredRuntime.importState(serializedState);

    expect(restoredSnapshot.choices).toEqual(afterPipeCheck.choices);
    expect(restoredSnapshot.text).toContain('Терраса была небольшой');

    current = chooseByText(
      restoredRuntime,
      restoredSnapshot,
      'Не торопиться и осмотреть дом сверху донизу',
    );
    expect(current.text).toContain('Над краем кровати');
  });
});
