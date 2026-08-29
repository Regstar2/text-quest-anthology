import type {InkStoryContent} from './InkStoryRuntime';

export type StoryMetadata = Readonly<{
  id: string;
  schemaVersion: number;
  contentVersion: number;
  title: string;
  description: string;
  cover: string;
  endingCount: number;
}>;

export type StoryAssetPaths = Readonly<{
  cover: string;
}>;

export type StoryManifestEntry = Readonly<{
  metadata: StoryMetadata;
  compiledStory: InkStoryContent;
  assets: StoryAssetPaths;
}>;
