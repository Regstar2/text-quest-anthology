import {Story} from 'inkjs';

export type InkStoryContent = ConstructorParameters<typeof Story>[0];

export type InkRuntimeChoice = {
  index: number;
  text: string;
};

export type InkRuntimeSnapshot = {
  text: string;
  choices: InkRuntimeChoice[];
  isEnded: boolean;
  endingId: string | null;
};

const ENDING_TAG_PREFIX = 'ending:';

export class InkStoryRuntime {
  private readonly story: Story;
  private currentText = '';
  private endingId: string | null = null;

  constructor(compiledStory: InkStoryContent) {
    this.story = new Story(compiledStory);
  }

  continueToChoiceOrEnd(): InkRuntimeSnapshot {
    const textChunks: string[] = [];
    this.endingId = null;

    while (this.story.canContinue) {
      const text = this.story.Continue()?.trim();

      if (text) {
        textChunks.push(text);
      }

      for (const tag of this.story.currentTags ?? []) {
        if (tag.startsWith(ENDING_TAG_PREFIX)) {
          this.endingId = tag.slice(ENDING_TAG_PREFIX.length).trim() || null;
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
    return this.snapshot();
  }

  private snapshot(): InkRuntimeSnapshot {
    const choices = this.story.currentChoices.map(choice => ({
      index: choice.index,
      text: choice.text.trim(),
    }));
    const isEnded = !this.story.canContinue && choices.length === 0;

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
