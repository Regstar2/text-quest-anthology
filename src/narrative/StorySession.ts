import {InkStoryRuntime, type InkRuntimeSnapshot} from './InkStoryRuntime';
import {
  isReaderSemanticAnchor,
  type ReaderSemanticAnchor,
} from './ReaderPosition';
import type {StoryManifestEntry} from './StoryMetadata';
import {
  StorySaveRepository,
  type ReaderCursor,
  type StorySave,
  type StorySaveLoadResult,
} from '../persistence/StorySaveRepository';

export type StorySessionRecovery =
  | 'corrupted-save-reset'
  | 'incompatible-save-reset'
  | 'storage-unavailable';

export const READER_PAGE_BREAK_MARKER = '\\uE001';

export type StoryReaderSnapshot = InkRuntimeSnapshot &
  Readonly<{
    passages: readonly string[];
    pageIndex: number;
    pageAnchor: ReaderSemanticAnchor | null;
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

export type StorySessionChoiceResult = Readonly<{
  snapshot: StoryReaderSnapshot;
  persistence: Promise<boolean>;
}> &
  PromiseLike<StorySessionMutationResult>;

export type StorySessionPageUpdate = Readonly<{
  persistence: Promise<boolean>;
}> &
  PromiseLike<StorySessionMutationResult>;

type Clock = () => Date;
const systemClock: Clock = () => new Date();
const LATEST_READER_PAGE_INDEX = Number.MAX_SAFE_INTEGER;
const READER_CURSOR_DEBOUNCE_MS = 150;

export class StorySession {
  private runtime: InkStoryRuntime;
  private currentSnapshot: InkRuntimeSnapshot;
  private currentReaderText: string;
  private readerPassages: string[];
  private readerPageIndex: number;
  private readerPageAnchor: ReaderSemanticAnchor | null;
  private narrativeRevision: number;
  private narrativeDirty: boolean;
  private narrativePersisted: boolean;
  private startedAt: string;
  private narrativePersistencePromise: Promise<boolean> | null = null;
  private fullSavePromise: Promise<boolean> | null = null;
  private readerCursorDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readerCursorDebouncePromise: Promise<boolean> | null = null;
  private resolveReaderCursorDebounce: ((persisted: boolean) => void) | null =
    null;
  private readerCursorWritePromise: Promise<boolean> | null = null;

  private constructor(
    private readonly storyPackage: StoryManifestEntry,
    private readonly repository: StorySaveRepository,
    private readonly clock: Clock,
    runtime: InkStoryRuntime,
    snapshot: InkRuntimeSnapshot,
    currentReaderText: string,
    readerPassages: readonly string[],
    readerPageIndex: number,
    readerPageAnchor: ReaderSemanticAnchor | null,
    narrativeRevision: number,
    narrativePersisted: boolean,
    startedAt: string,
  ) {
    this.runtime = runtime;
    this.currentSnapshot = snapshot;
    this.currentReaderText = currentReaderText;
    this.readerPassages = [...readerPassages];
    this.readerPageIndex = Math.max(0, readerPageIndex);
    this.readerPageAnchor = readerPageAnchor;
    this.narrativeRevision = narrativeRevision;
    this.narrativeDirty = !narrativePersisted;
    this.narrativePersisted = narrativePersisted;
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
      await bestEffortDeleteReaderCursor(repository, storyPackage.metadata.id);
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
      const narrativeRevision = loadResult.save.narrativeRevision ?? 0;
      let readerPageIndex = loadResult.save.readerPageIndex ?? 0;
      let readerPageAnchor = loadResult.save.readerPageAnchor ?? null;
      let recovery: StorySessionRecovery | null = null;

      try {
        const cursorResult = await repository.loadReaderCursor(
          storyPackage.metadata.id,
        );

        if (cursorResult.status === 'loaded') {
          const cursor = cursorResult.cursor;
          if (
            cursor.storyContentVersion === storyPackage.metadata.contentVersion &&
            cursor.narrativeRevision === narrativeRevision
          ) {
            readerPageIndex = cursor.pageIndex;
            readerPageAnchor = cursor.pageAnchor;
          } else {
            await bestEffortDeleteReaderCursor(
              repository,
              storyPackage.metadata.id,
            );
          }
        } else if (cursorResult.status === 'corrupted') {
          await bestEffortDeleteReaderCursor(repository, storyPackage.metadata.id);
        }
      } catch {
        recovery = 'storage-unavailable';
      }

      const session = new StorySession(
        storyPackage,
        repository,
        clock,
        runtime,
        snapshot,
        currentReaderText,
        readerPassages,
        readerPageIndex,
        readerPageAnchor,
        narrativeRevision,
        true,
        loadResult.save.startedAt,
      );

      return {
        session,
        snapshot: session.readerSnapshot(),
        resumed: true,
        recovery,
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

  setPage(
    pageIndex: number,
    pageAnchor: ReaderSemanticAnchor | null = null,
  ): StorySessionPageUpdate {
    if (!Number.isInteger(pageIndex) || pageIndex < 0) {
      throw new Error('READER_PAGE_INVALID: Page index must be non-negative.');
    }
    if (pageAnchor !== null && !isReaderSemanticAnchor(pageAnchor)) {
      throw new Error('READER_ANCHOR_INVALID: Reader anchor is invalid.');
    }

    this.readerPageIndex = pageIndex;
    this.readerPageAnchor = pageAnchor;
    const persistence = this.scheduleReaderCursorPersistence();

    return new DeferredPageUpdate(persistence, () => this.readerSnapshot());
  }

  choose(
    choiceIndex: number,
    readerPageIndex?: number,
  ): StorySessionChoiceResult {
    if (
      readerPageIndex !== undefined &&
      (!Number.isInteger(readerPageIndex) || readerPageIndex < 0)
    ) {
      throw new Error('READER_PAGE_INVALID: Page index must be non-negative.');
    }

    const previousChoiceCount = this.currentSnapshot.choices.length;
    this.currentSnapshot = this.runtime.choose(choiceIndex);
    this.currentReaderText = this.currentSnapshot.text;
    const nextPassages = passagesFromText(this.currentReaderText);

    if (this.readerPassages.length > 0 && nextPassages.length > 0) {
      this.readerPassages.push(
        `${READER_PAGE_BREAK_MARKER}:${previousChoiceCount}`,
      );
    }
    const firstNewPassageIndex = this.readerPassages.length;
    this.readerPassages.push(...nextPassages);
    this.readerPageIndex =
      readerPageIndex ??
      (this.currentSnapshot.isEnded ? LATEST_READER_PAGE_INDEX : 0);
    this.readerPageAnchor =
      firstNarrativeAnchor(this.readerPassages, firstNewPassageIndex) ??
      this.readerPageAnchor;
    this.narrativeRevision += 1;
    this.narrativeDirty = true;
    this.narrativePersisted = false;

    const snapshot = this.readerSnapshot();
    const persistence = this.deferNarrativePersistence();
    return new DeferredChoiceResult(snapshot, persistence);
  }

  async restart(): Promise<StorySessionMutationResult> {
    let persisted = true;

    if (this.narrativePersistencePromise !== null) {
      await this.narrativePersistencePromise;
    }
    this.cancelScheduledReaderCursorPersistence();

    if (this.readerCursorWritePromise !== null) {
      await this.readerCursorWritePromise;
    }

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
    this.readerPageAnchor = firstNarrativeAnchor(this.readerPassages, 0);
    this.narrativeRevision += 1;
    this.narrativeDirty = true;
    this.narrativePersisted = false;
    this.startedAt = this.clock().toISOString();

    if (!(await this.persistCurrentState())) {
      persisted = false;
    }

    return {snapshot: this.readerSnapshot(), persisted};
  }

  async flush(): Promise<boolean> {
    if (this.narrativePersistencePromise !== null) {
      return this.narrativePersistencePromise;
    }

    if (this.narrativeDirty || !this.narrativePersisted) {
      return this.persistCurrentState();
    }

    return this.flushReaderCursorDurably();
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
      firstNarrativeAnchor(readerPassages, 0),
      0,
      false,
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
      pageAnchor: this.readerPageAnchor,
    };
  }

  private deferNarrativePersistence(): Promise<boolean> {
    if (this.narrativePersistencePromise !== null) {
      return this.narrativePersistencePromise;
    }

    const persistence = new Promise<boolean>(resolve => {
      setTimeout(() => {
        void this.persistCurrentState().then(resolve);
      }, 0);
    });

    this.narrativePersistencePromise = persistence;
    void persistence.then(() => {
      if (this.narrativePersistencePromise === persistence) {
        this.narrativePersistencePromise = null;
      }
    });
    return persistence;
  }

  private persistCurrentState(): Promise<boolean> {
    if (this.fullSavePromise !== null) {
      return this.fullSavePromise;
    }

    const persistence = this.persistNarrativeUntilCurrent();
    this.fullSavePromise = persistence;
    void persistence.then(() => {
      if (this.fullSavePromise === persistence) {
        this.fullSavePromise = null;
      }
    });
    return persistence;
  }

  private async persistNarrativeUntilCurrent(): Promise<boolean> {
    while (true) {
      const revision = this.narrativeRevision;
      const save: StorySave = {
        storyId: this.storyPackage.metadata.id,
        storyContentVersion: this.storyPackage.metadata.contentVersion,
        runtimeState: this.runtime.exportState(),
        startedAt: this.startedAt,
        updatedAt: this.clock().toISOString(),
        completed: this.currentSnapshot.isEnded,
        endingId: this.currentSnapshot.endingId,
        narrativeRevision: revision,
        readerCurrentText: this.currentReaderText,
        readerPassages: [...this.readerPassages],
        readerPageIndex: this.readerPageIndex,
        readerPageAnchor: this.readerPageAnchor,
      };

      try {
        await this.repository.save(this.storyPackage.metadata.id, save);
      } catch {
        this.narrativeDirty = true;
        this.narrativePersisted = false;
        return false;
      }

      if (revision === this.narrativeRevision) {
        this.narrativeDirty = false;
        this.narrativePersisted = true;
        return true;
      }
    }
  }

  private scheduleReaderCursorPersistence(): Promise<boolean> {
    if (this.readerCursorDebounceTimer !== null) {
      clearTimeout(this.readerCursorDebounceTimer);
    }

    if (this.readerCursorDebouncePromise === null) {
      this.readerCursorDebouncePromise = new Promise<boolean>(resolve => {
        this.resolveReaderCursorDebounce = resolve;
      });
    }

    this.readerCursorDebounceTimer = setTimeout(() => {
      this.readerCursorDebounceTimer = null;
      const resolve = this.resolveReaderCursorDebounce;
      this.readerCursorDebouncePromise = null;
      this.resolveReaderCursorDebounce = null;

      void this.persistReaderCursor(false).then(persisted => {
        resolve?.(persisted);
      });
    }, READER_CURSOR_DEBOUNCE_MS);

    return this.readerCursorDebouncePromise;
  }

  private async flushReaderCursorDurably(): Promise<boolean> {
    const resolve = this.resolveReaderCursorDebounce;

    if (this.readerCursorDebounceTimer !== null) {
      clearTimeout(this.readerCursorDebounceTimer);
      this.readerCursorDebounceTimer = null;
    }
    this.readerCursorDebouncePromise = null;
    this.resolveReaderCursorDebounce = null;

    const persisted = await this.persistReaderCursor(true);
    resolve?.(persisted);
    return persisted;
  }

  private cancelScheduledReaderCursorPersistence(): void {
    if (this.readerCursorDebounceTimer !== null) {
      clearTimeout(this.readerCursorDebounceTimer);
      this.readerCursorDebounceTimer = null;
    }

    this.resolveReaderCursorDebounce?.(true);
    this.readerCursorDebouncePromise = null;
    this.resolveReaderCursorDebounce = null;
  }

  private async persistReaderCursor(durable: boolean): Promise<boolean> {
    while (this.readerCursorWritePromise !== null) {
      await this.readerCursorWritePromise;
    }

    const cursor: ReaderCursor = {
      storyId: this.storyPackage.metadata.id,
      storyContentVersion: this.storyPackage.metadata.contentVersion,
      narrativeRevision: this.narrativeRevision,
      pageIndex: this.readerPageIndex,
      pageAnchor: this.readerPageAnchor,
    };
    const persistence = this.repository
      .saveReaderCursor(this.storyPackage.metadata.id, cursor, durable)
      .then(
        () => true,
        () => false,
      );

    this.readerCursorWritePromise = persistence;
    const persisted = await persistence;
    if (this.readerCursorWritePromise === persistence) {
      this.readerCursorWritePromise = null;
    }
    return persisted;
  }
}

class DeferredChoiceResult
  implements PromiseLike<StorySessionMutationResult>
{
  constructor(
    readonly snapshot: StoryReaderSnapshot,
    readonly persistence: Promise<boolean>,
  ) {}

  then<TResult1 = StorySessionMutationResult, TResult2 = never>(
    onfulfilled?:
      | ((
          value: StorySessionMutationResult,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.persistence
      .then(persisted => ({snapshot: this.snapshot, persisted}))
      .then(onfulfilled, onrejected);
  }
}

class DeferredPageUpdate
  implements PromiseLike<StorySessionMutationResult>
{
  constructor(
    readonly persistence: Promise<boolean>,
    private readonly snapshotFactory: () => StoryReaderSnapshot,
  ) {}

  then<TResult1 = StorySessionMutationResult, TResult2 = never>(
    onfulfilled?:
      | ((
          value: StorySessionMutationResult,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.persistence
      .then(persisted => ({snapshot: this.snapshotFactory(), persisted}))
      .then(onfulfilled, onrejected);
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
    .split(/\\n\\s*\\n/g)
    .map(passage => passage.trim())
    .filter(passage => passage.length > 0);
}

function firstNarrativeAnchor(
  passages: readonly string[],
  startIndex: number,
): ReaderSemanticAnchor | null {
  for (let index = Math.max(0, startIndex); index < passages.length; index += 1) {
    if (!passages[index].startsWith(READER_PAGE_BREAK_MARKER)) {
      return {passageIndex: index, characterOffset: 0};
    }
  }
  return null;
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

async function bestEffortDeleteReaderCursor(
  repository: StorySaveRepository,
  storyId: string,
): Promise<void> {
  try {
    await repository.deleteReaderCursor(storyId);
  } catch {
    // Reader position is optional; the narrative save remains the source of truth.
  }
}
