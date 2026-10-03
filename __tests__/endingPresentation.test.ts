import {
  formatEndingDisplay,
  listStoryEndingIds,
} from '../src/app/EndingPresentation';
import {storyLoader} from '../src/narrative/StoryLoader';

const ZAVALINKA_ENDING_IDS = listStoryEndingIds(
  storyLoader.load('zavalinka').compiledStory,
);

describe('ending presentation', () => {
  test('maps sparse internal ending ids to dense user-facing ordinals', () => {
    expect(ZAVALINKA_ENDING_IDS).toHaveLength(10);
    expect(
      formatEndingDisplay('e15_station_together', ZAVALINKA_ENDING_IDS),
    ).toBe('Концовка №8 · Station together');
    expect(formatEndingDisplay('e17_two_bites', ZAVALINKA_ENDING_IDS)).toBe(
      'Концовка №10 · Two bites',
    );
  });

  test('extracts unique ending ids in internal narrative order', () => {
    expect(
      listStoryEndingIds({
        root: [
          '^ending:e17_two_bites',
          '^ending:e4_together_after_bite',
          '^ending:e15_station_together',
          '^ending:e1_quiet_morning',
          '^ending:e15_station_together',
        ],
      }),
    ).toEqual([
      'e1_quiet_morning',
      'e4_together_after_bite',
      'e15_station_together',
      'e17_two_bites',
    ]);
  });

  test('does not expose an internal sequence number for an unknown ending', () => {
    expect(formatEndingDisplay('e99_legacy', ZAVALINKA_ENDING_IDS)).toBe(
      'Концовка · Legacy',
    );
  });
});
