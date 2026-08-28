import {Story} from 'inkjs';

export type InkStoryContent = ConstructorParameters<typeof Story>[0];

export type InkRuntimeChoice = {
  index: number;
  text: string;
  enabled: boolean;
};

export type InkRuntimeSnapshot = {
  text: string;
  choices: InkRuntimeChoice[];
  isEnded: boolean;
  endingId: string | null;
};

type ChoiceOption = Readonly<{
  slot: number;
  text: string;
}>;

const ENDING_TAG_PREFIX = 'ending:';
const CHOICE_OPTION_TAG_PREFIX = 'choice-option:';

export class InkStoryRuntime {
  private readonly story: Story;
  private currentText = '';
  private endingId: string | null = null;
  private choiceOptions: ChoiceOption[] = [];

  constructor(compiledStory: InkStoryContent) {
    this.story = new Story(compiledStory);
  }

  continueToChoiceOrEnd(): InkRuntimeSnapshot {
    const textChunks: string[] = [];
    this.endingId = null;
    this.choiceOptions = [];

    while (this.story.canContinue) {
      const text = this.story.Continue()?.trim();

      if (text) {
        textChunks.push(text);
      }

      for (const tag of this.story.currentTags ?? []) {
        if (tag.startsWith(ENDING_TAG_PREFIX)) {
          this.endingId = tag.slice(ENDING_TAG_PREFIX.length).trim() || null;
        }

        const choiceOption = parseChoiceOption(tag);
        if (
          choiceOption &&
          !this.choiceOptions.some(
            option =>
              option.slot === choiceOption.slot && option.text === choiceOption.text,
          )
        ) {
          this.choiceOptions.push(choiceOption);
        }
      }
    }

    this.currentText = textChunks.join('\n\n');
    return this.snapshot();
  }

  choose(choiceIndex: number): InkRuntimeSnapshot {
    const choiceExists = this.story.currentChoices.some(
      choice => choice.index === choiceIndex,
    );

    if (!choiceExists) {
      throw new Error(`Ink choice index ${choiceIndex} is not available.`);
    }

    this.story.ChooseChoiceIndex(choiceIndex);
    return this.continueToChoiceOrEnd();
  }

  exportState(): string {
    return this.story.state.ToJson();
  }

  importState(serializedState: string): InkRuntimeSnapshot {
    this.story.state.LoadJson(serializedState);
    this.currentText = (this.story.currentText ?? '').trim();
    this.endingId = this.readEndingId(this.story.currentTags ?? []);
    this.choiceOptions = readChoiceOptions(this.story.currentTags ?? []);
    return this.snapshot();
  }

  private snapshot(): InkRuntimeSnapshot {
    const availableChoices = this.story.currentChoices.map(choice => ({
      index: choice.index,
      text: choice.text.trim(),
      enabled: true,
    }));
    const choices = mergeChoiceOptions(availableChoices, this.choiceOptions);
    const isEnded = !this.story.canContinue && availableChoices.length === 0;

    return {
      text: this.currentText,
      choices,
      isEnded,
      endingId: isEnded ? this.endingId : null,
    };
  }

  private readEndingId(tags: string[]): string | null {
    const endingTag = tags.find(tag => tag.startsWith(ENDING_TAG_PREFIX));
    return endingTag?.slice(ENDING_TAG_PREFIX.length).trim() || null;
  }
}

function parseChoiceOption(tag: string): ChoiceOption | null {
  if (!tag.startsWith(CHOICE_OPTION_TAG_PREFIX)) {
    return null;
  }

  const payload = tag.slice(CHOICE_OPTION_TAG_PREFIX.length);
  const separatorIndex = payload.indexOf(':');

  if (separatorIndex <= 0) {
    return null;
  }

  const slot = Number(payload.slice(0, separatorIndex).trim());
  const text = payload.slice(separatorIndex + 1).trim();

  if (!Number.isInteger(slot) || slot < 0 || text.length === 0) {
    return null;
  }

  return {slot, text};
}

function readChoiceOptions(tags: readonly string[]): ChoiceOption[] {
  const options: ChoiceOption[] = [];

  for (const tag of tags) {
    const option = parseChoiceOption(tag);
    if (
      option &&
      !options.some(item => item.slot === option.slot && item.text === option.text)
    ) {
      options.push(option);
    }
  }

  return options;
}

function mergeChoiceOptions(
  availableChoices: readonly InkRuntimeChoice[],
  options: readonly ChoiceOption[],
): InkRuntimeChoice[] {
  const unavailableOptions = options.filter(
    option => !availableChoices.some(choice => choice.text === option.text),
  );

  if (unavailableOptions.length === 0) {
    return [...availableChoices];
  }

  const result: Array<InkRuntimeChoice | undefined> = new Array(
    availableChoices.length + unavailableOptions.length,
  );

  for (const option of [...unavailableOptions].sort((left, right) => left.slot - right.slot)) {
    let slot = Math.min(option.slot, result.length - 1);
    while (slot < result.length && result[slot]) {
      slot += 1;
    }
    if (slot >= result.length) {
      slot = result.findIndex(item => item === undefined);
    }

    result[slot] = {
      index: -1,
      text: option.text,
      enabled: false,
    };
  }

  let availableIndex = 0;
  for (let slot = 0; slot < result.length; slot += 1) {
    if (!result[slot]) {
      result[slot] = availableChoices[availableIndex];
      availableIndex += 1;
    }
  }

  return result.filter((choice): choice is InkRuntimeChoice => Boolean(choice));
}
