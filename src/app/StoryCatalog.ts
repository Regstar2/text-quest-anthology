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
}>;

export type StoryCatalogSnapshot = Readonly<{
  items: readonly StoryCatalogItem[];
  storageUnavailable: boolean;
}>;

type StoryMetadataSource = Pick<StoryLoader, 'listMetadata'>;
type StorySaveSource = Pick<StorySaveRepository, 'load'>;
type EndingCountSource = Readonly<{
  count(storyId: string): Promise<number>;
}>;

export async function loadStoryCatalog(
  loader: StoryMetadataSource,
  repository: StorySaveSource,
  endings?: EndingCountSource,
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

    let unlockedEndingCount = 0;
    if (endings) {
      try {
        unlockedEndingCount = await endings.count(metadata.id);
      } catch {
        storageUnavailable = true;
      }
    }

    const state = resolveStoryCatalogState(metadata, loadResult);
    items.push({metadata, ...state, unlockedEndingCount});
  }

  return {items, storageUnavailable};
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
