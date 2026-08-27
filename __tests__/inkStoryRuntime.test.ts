import syntheticStory from '../src/stories/generated/synthetic.json';
import {
  InkStoryRuntime,
  type InkRuntimeSnapshot,
  type InkStoryContent,
} from '../src/narrative/InkStoryRuntime';

const COMPILED_STORY = syntheticStory as InkStoryContent;

function startStory(): {
  runtime: InkStoryRuntime;
  snapshot: InkRuntimeSnapshot;
} {
  const runtime = new InkStoryRuntime(COMPILED_STORY);
  return {
    runtime,
    snapshot: runtime.continueToChoiceOrEnd(),
  };
}

describe('InkStoryRuntime synthetic story', () => {
  test('choice A reaches ending_a through the Ink conditional branch', () => {
    const {runtime, snapshot} = startStory();

    expect(snapshot.isEnded).toBe(false);
    expect(snapshot.choices).toHaveLength(2);

    const result = runtime.choose(snapshot.choices[0].index);

    expect(result.isEnded).toBe(true);
    expect(result.choices).toHaveLength(0);
    expect(result.endingId).toBe('ending_a');
    expect(result.text).toContain('выходишь в коридор');
  });

  test('choice B reaches a different terminal ending', () => {
    const {runtime, snapshot} = startStory();
    const result = runtime.choose(snapshot.choices[1].index);

    expect(result.isEnded).toBe(true);
    expect(result.choices).toHaveLength(0);
    expect(result.endingId).toBe('ending_b');
    expect(result.text).toContain('остаёшься внутри');
  });

  test('Ink state is serializable and can be restored before a choice', () => {
    const {runtime, snapshot} = startStory();
    const serializedState = runtime.exportState();

    expect(() => JSON.parse(serializedState)).not.toThrow();

    const restoredRuntime = new InkStoryRuntime(COMPILED_STORY);
    const restoredSnapshot = restoredRuntime.importState(serializedState);

    expect(restoredSnapshot.choices).toEqual(snapshot.choices);

    const result = restoredRuntime.choose(restoredSnapshot.choices[1].index);
    expect(result.endingId).toBe('ending_b');
  });
});
