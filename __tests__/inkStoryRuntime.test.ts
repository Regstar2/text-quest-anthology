import {
  InkStoryRuntime,
  type InkRuntimeSnapshot,
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

function chooseByText(
  runtime: InkStoryRuntime,
  snapshot: InkRuntimeSnapshot,
  textStart: string,
): InkRuntimeSnapshot {
  const choice = snapshot.choices.find(item => item.text.startsWith(textStart));
  if (!choice) {
    throw new Error(`Expected choice starting with "${textStart}".`);
  }
  return runtime.choose(choice.index);
}

describe('InkStoryRuntime packaged story', () => {
  test('prepared route exposes the delayed pipe choice and reaches the attic-dawn ending', () => {
    const {runtime, snapshot} = startStory();

    expect(snapshot.isEnded).toBe(false);
    expect(snapshot.choices).toHaveLength(2);
    expect(snapshot.text).toContain('Ливень начался не сразу');

    let current = chooseByText(runtime, snapshot, 'Сначала обойти дом');
    current = chooseByText(runtime, current, 'Осмотреть дом тщательно');
    current = chooseByText(runtime, current, 'Укрепить вход');

    expect(current.choices.map(choice => choice.text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('сразу подняться на подготовленный чердак'),
      ]),
    );

    current = chooseByText(runtime, current, 'Не подходить к окну');
    expect(current.choices.map(choice => choice.text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Сразу заблокировать маленькое окно'),
      ]),
    );

    const result = chooseByText(runtime, current, 'Сразу заблокировать');
    expect(result.isEnded).toBe(true);
    expect(result.choices).toHaveLength(0);
    expect(result.endingId).toBe('e7_attic_dawn');
    expect(result.text).toContain('К рассвету');
  });

  test('direct-entry route cannot use unknown pipe knowledge and reaches the glass ending', () => {
    const {runtime, snapshot} = startStory();

    let current = chooseByText(runtime, snapshot, 'Зайти в дом сразу');
    current = chooseByText(runtime, current, 'Осмотреть дом тщательно');
    current = chooseByText(runtime, current, 'Укрепить вход');
    current = chooseByText(runtime, current, 'Не подходить к окну');

    expect(
      current.choices.some(choice =>
        choice.text.startsWith('Сразу заблокировать маленькое окно'),
      ),
    ).toBe(false);

    const result = chooseByText(runtime, current, 'Остаться у люка');
    expect(result.isEnded).toBe(true);
    expect(result.endingId).toBe('e12_glass');
    expect(result.text).toContain('Третий удар выбивает стекло');
  });

  test('Ink state is serializable and restores the current decision point', () => {
    const {runtime, snapshot} = startStory();
    const afterPipeCheck = chooseByText(
      runtime,
      snapshot,
      'Сначала обойти дом',
    );
    const serializedState = runtime.exportState();

    expect(() => JSON.parse(serializedState)).not.toThrow();

    const restoredStory = storyLoader.load(STORY_METADATA.id);
    const restoredRuntime = new InkStoryRuntime(restoredStory.compiledStory);
    const restoredSnapshot = restoredRuntime.importState(serializedState);

    expect(restoredSnapshot.choices).toEqual(afterPipeCheck.choices);
    expect(restoredSnapshot.text).toContain('Внутри тихо');

    const continued = chooseByText(
      restoredRuntime,
      restoredSnapshot,
      'Осмотреть дом тщательно',
    );
    expect(continued.text).toContain('Над кроватью обнаруживается');
  });
});
