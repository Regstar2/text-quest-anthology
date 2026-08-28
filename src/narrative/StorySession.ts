import {InkStoryRuntime, type InkRuntimeSnapshot} from './InkStoryRuntime';
import type {StoryManifestEntry} from './StoryMetadata';
import {
  StorySaveRepository,
  type StorySave,
  type StorySaveLoadResult,
} from '../persistence/StorySaveRepository';

export type StorySessionRecovery =
  | 'corrupted-save-reset'
  | 'incompatible-save-reset'
  | 'storage-unavailable';

export type StoryReaderSnapshot = InkRuntimeSnapshot &
  Readonly<{
    passages: readonly string[];
    pageIndex: number;
    pageCount: number;
    pageText: string;
    hasNextPage: boolean;
  }>;

export type StorySessionOpenResult = Readonly<{
  session: StorySession;
  snapshot: StoryReaderSnapshot;
  resumed: boolean;
  recovery: StorySessionRecovery | null;
}>;

export type StorySessionMutationResult = Readonly<{
  snapshot: StoryReaderSnapshot;
  persisted: boolean;
}>;

type Clock = () => Date;

const systemClock: Clock = () => new Date();

export class StorySession {
  private runtime: InkStoryRuntime;
  private currentSnapshot: InkRuntimeSnapshot;
  private readerPassages: string[];
  private readerPageIndex: number;
  private startedAt: string;

  private constructor(
    private readonly storyPackage: StoryManifestEntry,
    private readonly repository: StorySaveRepository,
    private readonly clock: Clock,
    runtime: InkStoryRuntime,
    snapshot: InkRuntimeSnapshot,
    readerPassages: readonly string[],
    readerPageIndex: number,
    startedAt: string,
  ) {
    this.runtime = runtime;
    this.currentSnapshot = snapshot;
    this.readerPassages = [...readerPassages];
    this.readerPageIndex = normalizePageIndex(snapshot, readerPageIndex);
    this.startedAt = startedAt;
  }

  static async open(
    storyPackage: StoryManifestEntry,
    repository: StorySaveRepository,
    clock: Clock = systemClock,
  ): Promise<StorySessionOpenResult> {
    let loadResult: StorySaveLoadResult;

    try {
      loadResult = await repository.load(storyPackage.metadata.id);
    } catch {
      return StorySession.createFresh(
        storyPackage,
        repository,
        clock,
        'storage-unavailable',
      );
    }

    if (loadResult.status === 'not-found') {
      return StorySession.createFresh(storyPackage, repository, clock, null);
    }

    if (loadResult.status === 'corrupted') {
      await bestEffortDelete(repository, storyPackage.metadata.id);
      return StorySession.createFresh(
        storyPackage,
        repository,
        clock,
        'corrupted-save-reset',
      );
    }

    if (
      loadResult.save.storyContentVersion !==
      storyPackage.metadata.contentVersion
    ) {
      await bestEffortDelete(repository, storyPackage.metadata.id);
      return StorySession.createFresh(
        storyPackage,
        repository,
        clock,
        'incompatible-save-reset',
      );
    }

    const runtime = new InkStoryRuntime(storyPackage.compiledStory);

    try {
      const snapshot = runtime.importState(loadResult.save.runtimeState);

      if (!matchesSavedCompletion(loadResult.save, snapshot)) {
        await bestEffortDelete(repository, storyPackage.metadata.id);
        return StorySession.createFresh(
          storyPackage,
          repository,
          clock,
          'corrupted-save-reset',
        );
      }

      const readerPassages =
        loadResult.save.readerPassages ?? passagesFromText(snapshot.text);
      const readerPageIndex =
        loadResult.save.readerPageIndex ?? legacyPageIndex(snapshot);
      const session = new StorySession(
        storyPackage,
        repository,
        clock,
        runtime,
        snapshot,
        readerPassages,
        readerPageIndex,
        loadResult.save.startedAt,
      );

      return {
        session,
        snapshot: session.readerSnapshot(),
        resumed: true,
        recovery: null,
      };
    } catch {
      await bestEffortDelete(repository, storyPackage.metadata.id);
      return StorySession.createFresh(
        storyPackage,
        repository,
        clock,
        'corrupted-save-reset',
      );
    }
  }

  async nextPage(): Promise<StorySessionMutationResult> {
    const pages = pagesFromText(this.currentSnapshot.text);

    if (this.readerPageIndex >= pages.length - 1) {
      throw new Error('READER_PAGE_END: Current passage has no next page.');
    }

    this.readerPageIndex += 1;

    return {
      snapshot: this.readerSnapshot(),
      persisted: await this.persistCurrentState(),
    };
  }

  async choose(choiceIndex: number): Promise<StorySessionMutationResult> {
    this.currentSnapshot = this.runtime.choose(choiceIndex);
    this.readerPassages.push(...passagesFromText(this.currentSnapshot.text));
    this.readerPageIndex = 0;

    return {
      snapshot: this.readerSnapshot(),
      persisted: await this.persistCurrentState(),
    };
  }

  async restart(): Promise<StorySessionMutationResult> {
    let persisted = true;

    try {
      await this.repository.delete(this.storyPackage.metadata.id);
    } catch {
      persisted = false;
    }

    const fresh = createRuntimeAtStart(this.storyPackage);
    this.runtime = fresh.runtime;
    this.currentSnapshot = fresh.snapshot;
    this.readerPassages = passagesFromText(fresh.snapshot.text);
    this.readerPageIndex = 0;
    this.startedAt = this.clock().toISOString();

    if (!(await this.persistCurrentState())) {
      persisted = false;
    }

    return {snapshot: this.readerSnapshot(), persisted};
  }

  async flush(): Promise<boolean> {
    return this.persistCurrentState();
  }

  private static createFresh(
    storyPackage: StoryManifestEntry,
    repository: StorySaveRepository,
    clock: Clock,
    recovery: StorySessionRecovery | null,
  ): StorySessionOpenResult {
    const fresh = createRuntimeAtStart(storyPackage);
    const readerPassages = passagesFromText(fresh.snapshot.text);
    const session = new StorySession(
      storyPackage,
      repository,
      clock,
      fresh.runtime,
      fresh.snapshot,
      readerPassages,
      0,
      clock().toISOString(),
    );

    return {
      session,
      snapshot: session.readerSnapshot(),
      resumed: false,
      recovery,
    };
  }

  private readerSnapshot(): StoryReaderSnapshot {
    return createReaderSnapshot(
      this.currentSnapshot,
      this.readerPassages,
      this.readerPageIndex,
    );
  }

  private async persistCurrentState(): Promise<boolean> {
    const save: StorySave = {
      storyId: this.storyPackage.metadata.id,
      storyContentVersion: this.storyPackage.metadata.contentVersion,
      runtimeState: this.runtime.exportState(),
      startedAt: this.startedAt,
      updatedAt: this.clock().toISOString(),
      completed: this.currentSnapshot.isEnded,
      endingId: this.currentSnapshot.endingId,
      readerPassages: [...this.readerPassages],
      readerPageIndex: this.readerPageIndex,
    };

    try {
      await this.repository.save(this.storyPackage.metadata.id, save);
      return true;
    } catch {
      return false;
    }
  }
}

function createRuntimeAtStart(storyPackage: StoryManifestEntry): Readonly<{
  runtime: InkStoryRuntime;
  snapshot: InkRuntimeSnapshot;
}> {
  const runtime = new InkStoryRuntime(storyPackage.compiledStory);
  return {runtime, snapshot: runtime.continueToChoiceOrEnd()};
}

function createReaderSnapshot(
  snapshot: InkRuntimeSnapshot,
  passages: readonly string[],
  pageIndex: number,
): StoryReaderSnapshot {
  const pages = pagesFromText(snapshot.text);
  const normalizedPageIndex = normalizePageIndex(snapshot, pageIndex);

  return {
    ...snapshot,
    passages: [...passages],
    pageIndex: normalizedPageIndex,
    pageCount: pages.length,
    pageText: pages[normalizedPageIndex] ?? '',
    hasNextPage: normalizedPageIndex < pages.length - 1,
  };
}

function passagesFromText(text: string): string[] {
  return text
    .split(/\n\s*\n/g)
    .map(passage => passage.trim())
    .filter(passage => passage.length > 0);
}

function pagesFromText(text: string): string[] {
  const pages = passagesFromText(text);
  return pages.length > 0 ? pages : [''];
}

function normalizePageIndex(snapshot: InkRuntimeSnapshot, pageIndex: number): number {
  const lastPageIndex = pagesFromText(snapshot.text).length - 1;
  return Math.min(Math.max(pageIndex, 0), lastPageIndex);
}

function legacyPageIndex(snapshot: InkRuntimeSnapshot): number {
  return pagesFromText(snapshot.text).length - 1;
}

function matchesSavedCompletion(
  save: StorySave,
  snapshot: InkRuntimeSnapshot,
): boolean {
  return (
    save.completed === snapshot.isEnded && save.endingId === snapshot.endingId
  );
}

async function bestEffortDelete(
  repository: StorySaveRepository,
  storyId: string,
): Promise<void> {
  try {
    await repository.delete(storyId);
  } catch {
    // A valid fresh runtime is safer than failing startup on storage cleanup.
  }
}
