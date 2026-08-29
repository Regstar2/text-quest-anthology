import type {StoryLoader} from '../narrative/StoryLoader';
import type {StoryMetadata} from '../narrative/StoryMetadata';
import type {
  StorySaveLoadResult,
  StorySaveRepository,
} from '../persistence/StorySaveRepository';

export type StoryCatalogAction = 'start' | 'continue' | 'restart';
export type StoryCatalogProgress = 'not-started' | 'in-progress' | 'completed';

export type StoryCatalogItem = Readonly<{
  metadata: StoryMetadata;
  action: StoryCatalogAction;
  progress: StoryCatalogProgress;
  unlockedEndingCount: number;
  totalEndingCount: number | null;
}>;

export type StoryCatalogSnapshot = Readonly<{
  items: readonly StoryCatalogItem[];
  storageUnavailable: boolean;
}>;

type StoryCatalogSource = Pick<StoryLoader, 'listMetadata'> &
  Partial<Pick<StoryLoader, 'load'>>;
type StorySaveSource = Pick<StorySaveRepository, 'load'>;
type EndingHistorySource = Readonly<{
  count(storyId: string): Promise<number>;
  unlock?(
    storyId: string,
    ending: Readonly<{id: string; text: string}>,
  ): Promise<unknown>;
}>;

export async function loadStoryCatalog(
  loader: StoryCatalogSource,
  repository: StorySaveSource,
  endings?: EndingHistorySource,
): Promise<StoryCatalogSnapshot> {
  const items: StoryCatalogItem[] = [];
  let storageUnavailable = false;

  for (const metadata of loader.listMetadata()) {
    let loadResult: StorySaveLoadResult;

    try {
      loadResult = await repository.load(metadata.id);
    } catch {
      storageUnavailable = true;
      loadResult = {status: 'not-found'};
    }

    if (
      endings?.unlock &&
      loadResult.status === 'loaded' &&
      loadResult.save.storyContentVersion === metadata.contentVersion &&
      loadResult.save.completed &&
      loadResult.save.endingId
    ) {
      try {
        await endings.unlock(metadata.id, {
          id: loadResult.save.endingId,
          text: loadResult.save.readerCurrentText ?? '',
        });
      } catch {
        storageUnavailable = true;
      }
    }

    let unlockedEndingCount = 0;
    if (endings) {
      try {
        unlockedEndingCount = await endings.count(metadata.id);
      } catch {
        storageUnavailable = true;
      }
    }

    let totalEndingCount: number | null = null;
    if (loader.load) {
      try {
        totalEndingCount = countStoryEndings(
          loader.load(metadata.id).compiledStory,
        );
      } catch {
        totalEndingCount = null;
      }
    }

    const state = resolveStoryCatalogState(metadata, loadResult);
    items.push({
      metadata,
      ...state,
      unlockedEndingCount,
      totalEndingCount,
    });
  }

  return {items, storageUnavailable};
}

export function countStoryEndings(compiledStory: unknown): number {
  let serialized: string;

  try {
    serialized = JSON.stringify(compiledStory) ?? '';
  } catch {
    return 0;
  }

  const endingIds = new Set<string>();
  for (const match of serialized.matchAll(/ending:([A-Za-z0-9._-]+)/g)) {
    const endingId = match[1]?.trim();
    if (endingId) {
      endingIds.add(endingId);
    }
  }

  return endingIds.size;
}

export function resolveStoryCatalogAction(
  metadata: StoryMetadata,
  loadResult: StorySaveLoadResult,
): StoryCatalogAction {
  return resolveStoryCatalogState(metadata, loadResult).action;
}

export function resolveStoryCatalogState(
  metadata: StoryMetadata,
  loadResult: StorySaveLoadResult,
): Readonly<{
  action: StoryCatalogAction;
  progress: StoryCatalogProgress;
}> {
  if (
    loadResult.status !== 'loaded' ||
    loadResult.save.storyContentVersion !== metadata.contentVersion
  ) {
    return {action: 'start', progress: 'not-started'};
  }

  if (loadResult.save.completed) {
    return {action: 'restart', progress: 'completed'};
  }

  return {action: 'continue', progress: 'in-progress'};
}
