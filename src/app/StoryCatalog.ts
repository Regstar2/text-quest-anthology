import type {StoryLoader} from '../narrative/StoryLoader';
import type {StoryMetadata} from '../narrative/StoryMetadata';
import type {
  StorySaveLoadResult,
  StorySaveRepository,
} from '../persistence/StorySaveRepository';

export type StoryCatalogAction = 'start' | 'continue' | 'ending';

export type StoryCatalogItem = Readonly<{
  metadata: StoryMetadata;
  action: StoryCatalogAction;
}>;

export type StoryCatalogSnapshot = Readonly<{
  items: readonly StoryCatalogItem[];
  storageUnavailable: boolean;
}>;

type StoryMetadataSource = Pick<StoryLoader, 'listMetadata'>;
type StorySaveSource = Pick<StorySaveRepository, 'load'>;

export async function loadStoryCatalog(
  loader: StoryMetadataSource,
  repository: StorySaveSource,
): Promise<StoryCatalogSnapshot> {
  const items: StoryCatalogItem[] = [];
  let storageUnavailable = false;

  for (const metadata of loader.listMetadata()) {
    let loadResult: StorySaveLoadResult;

    try {
      loadResult = await repository.load(metadata.id);
    } catch {
      storageUnavailable = true;
      items.push({metadata, action: 'start'});
      continue;
    }

    items.push({
      metadata,
      action: resolveStoryCatalogAction(metadata, loadResult),
    });
  }

  return {items, storageUnavailable};
}

export function resolveStoryCatalogAction(
  metadata: StoryMetadata,
  loadResult: StorySaveLoadResult,
): StoryCatalogAction {
  if (loadResult.status !== 'loaded') {
    return 'start';
  }

  if (loadResult.save.storyContentVersion !== metadata.contentVersion) {
    return 'start';
  }

  return loadResult.save.completed ? 'ending' : 'continue';
}
