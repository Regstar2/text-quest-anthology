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

describe('InkStoryRuntime packaged story', () => {
  test('first branch reaches a second decision and then ending_eye', () => {
    const {runtime, snapshot} = startStory();

    expect(snapshot.isEnded).toBe(false);
    expect(snapshot.choices).toHaveLength(2);

    const nearDoor = runtime.choose(snapshot.choices[0].index);
    expect(nearDoor.isEnded).toBe(false);
    expect(nearDoor.choices).toHaveLength(3);
    expect(nearDoor.text).toContain('прихожей');

    const result = runtime.choose(nearDoor.choices[0].index);
    expect(result.isEnded).toBe(true);
    expect(result.choices).toHaveLength(0);
    expect(result.endingId).toBe('ending_eye');
    expect(result.text).toContain('мутный глаз');
  });

  test('second initial branch reaches ending_light', () => {
    const {runtime, snapshot} = startStory();
    const stayBed = runtime.choose(snapshot.choices[1].index);

    expect(stayBed.isEnded).toBe(false);
    expect(stayBed.choices).toHaveLength(2);

    const result = runtime.choose(stayBed.choices[1].index);
    expect(result.isEnded).toBe(true);
    expect(result.choices).toHaveLength(0);
    expect(result.endingId).toBe('ending_light');
    expect(result.text).toContain('Яркая прихожая');
  });

  test('Ink state is serializable and can be restored before a choice', () => {
    const {runtime, snapshot} = startStory();
    const serializedState = runtime.exportState();

    expect(() => JSON.parse(serializedState)).not.toThrow();

    const restoredStory = storyLoader.load(STORY_METADATA.id);
    const restoredRuntime = new InkStoryRuntime(restoredStory.compiledStory);
    const restoredSnapshot = restoredRuntime.importState(serializedState);

    expect(restoredSnapshot.choices).toEqual(snapshot.choices);

    const result = restoredRuntime.choose(restoredSnapshot.choices[1].index);
    expect(result.isEnded).toBe(false);
    expect(result.choices).toHaveLength(2);
  });
});
