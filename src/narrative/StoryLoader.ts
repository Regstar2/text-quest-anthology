import {STORY_MANIFEST} from '../stories/generated/manifest';
import type {StoryManifestEntry, StoryMetadata} from './StoryMetadata';

export class StoryLoader {
  private readonly storiesById: ReadonlyMap<string, StoryManifestEntry>;

  constructor(entries: readonly StoryManifestEntry[] = STORY_MANIFEST) {
    const storiesById = new Map<string, StoryManifestEntry>();

    for (const entry of entries) {
      if (storiesById.has(entry.metadata.id)) {
        throw new Error(
          `DUPLICATE_STORY_ID: Story id "${entry.metadata.id}" exists more than once in the manifest.`,
        );
      }

      storiesById.set(entry.metadata.id, entry);
    }

    this.storiesById = storiesById;
  }

  listMetadata(): readonly StoryMetadata[] {
    return Array.from(this.storiesById.values(), entry => entry.metadata);
  }

  load(storyId: string): StoryManifestEntry {
    const story = this.storiesById.get(storyId);

    if (!story) {
      throw new Error(`STORY_NOT_FOUND: Unknown story id "${storyId}".`);
    }

    return story;
  }
}

export const storyLoader = new StoryLoader();
