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

export const READER_PAGE_BREAK_MARKER = '\uE001';

export type StoryReaderSnapshot = InkRuntimeSnapshot &
  Readonly<{
    passages: readonly string[];
    pageIndex: number;
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
const LATEST_READER_PAGE_INDEX = Number.MAX_SAFE_INTEGER;

export class StorySession {
  private runtime: InkStoryRuntime;
  private currentSnapshot: InkRuntimeSnapshot;
  private currentReaderText: string;
  private readerPassages: string[];
  private readerPageIndex: number;
  private startedAt: string;

  private constructor(
    private readonly storyPackage: StoryManifestEntry,
    private readonly repository: StorySaveRepository,
    private readonly clock: Clock,
    runtime: InkStoryRuntime,
    snapshot: InkRuntimeSnapshot,
    currentReaderText: string,
    readerPassages: readonly string[],
    readerPageIndex: number,
    startedAt: string,
  ) {
    this.runtime = runtime;
    this.currentSnapshot = snapshot;
    this.currentReaderText = currentReaderText;
    this.readerPassages = [...readerPassages];
    this.readerPageIndex = Math.max(0, readerPageIndex);
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

      const currentReaderText = loadResult.save.readerCurrentText ?? snapshot.text;
      const readerPassages =
        loadResult.save.readerPassages ?? passagesFromText(currentReaderText);
      const session = new StorySession(
        storyPackage,
        repository,
        clock,
        runtime,
        snapshot,
        currentReaderText,
        readerPassages,
        loadResult.save.readerPageIndex ?? 0,
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

  async setPage(pageIndex: number): Promise<StorySessionMutationResult> {
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      throw new Error('READER_PAGE_INVALID: Page index must be non-negative.');
    }

    this.readerPageIndex = pageIndex;
    return {
      snapshot: this.readerSnapshot(),
      persisted: await this.persistCurrentState(),
    };
  }

  async choose(choiceIndex: number): Promise<StorySessionMutationResult> {
    this.currentSnapshot = this.runtime.choose(choiceIndex);
    this.currentReaderText = this.currentSnapshot.text;
    const nextPassages = passagesFromText(this.currentReaderText);

    if (this.readerPassages.length > 0 && nextPassages.length > 0) {
      this.readerPassages.push(READER_PAGE_BREAK_MARKER);
    }
    this.readerPassages.push(...nextPassages);
    this.readerPageIndex = this.currentSnapshot.isEnded
      ? LATEST_READER_PAGE_INDEX
      : 0;

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
    this.currentReaderText = fresh.snapshot.text;
    this.readerPassages = passagesFromText(this.currentReaderText);
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
      fresh.snapshot.text,
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
    return {
      ...this.currentSnapshot,
      text: this.currentReaderText,
      passages: [...this.readerPassages],
      pageIndex: this.readerPageIndex,
    };
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
      readerCurrentText: this.currentReaderText,
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

function passagesFromText(text: string): string[] {
  return text
    .split(/\n\s*\n/g)
    .map(passage => passage.trim())
    .filter(passage => passage.length > 0);
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
