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

export type StorySessionOpenResult = Readonly<{
  session: StorySession;
  snapshot: InkRuntimeSnapshot;
  resumed: boolean;
  recovery: StorySessionRecovery | null;
}>;

export type StorySessionMutationResult = Readonly<{
  snapshot: InkRuntimeSnapshot;
  persisted: boolean;
}>;

type Clock = () => Date;

const systemClock: Clock = () => new Date();

export class StorySession {
  private runtime: InkStoryRuntime;
  private currentSnapshot: InkRuntimeSnapshot;
  private startedAt: string;

  private constructor(
    private readonly storyPackage: StoryManifestEntry,
    private readonly repository: StorySaveRepository,
    private readonly clock: Clock,
    runtime: InkStoryRuntime,
    snapshot: InkRuntimeSnapshot,
    startedAt: string,
  ) {
    this.runtime = runtime;
    this.currentSnapshot = snapshot;
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

      return {
        session: new StorySession(
          storyPackage,
          repository,
          clock,
          runtime,
          snapshot,
          loadResult.save.startedAt,
        ),
        snapshot,
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

  async choose(choiceIndex: number): Promise<StorySessionMutationResult> {
    this.currentSnapshot = this.runtime.choose(choiceIndex);

    return {
      snapshot: this.currentSnapshot,
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
    this.startedAt = this.clock().toISOString();

    if (!(await this.persistCurrentState())) {
      persisted = false;
    }

    return {snapshot: this.currentSnapshot, persisted};
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
    const session = new StorySession(
      storyPackage,
      repository,
      clock,
      fresh.runtime,
      fresh.snapshot,
      clock().toISOString(),
    );

    return {
      session,
      snapshot: fresh.snapshot,
      resumed: false,
      recovery,
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
