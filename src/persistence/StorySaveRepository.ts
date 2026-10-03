import {
  isReaderSemanticAnchor,
  type ReaderSemanticAnchor,
} from '../narrative/ReaderPosition';

export type StorySaveStorage = Readonly<{
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  setItemDeferred?(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}>;

export type StorySave = Readonly<{
  storyId: string;
  storyContentVersion: number;
  runtimeState: string;
  startedAt: string;
  updatedAt: string;
  completed: boolean;
  endingId: string | null;
  narrativeRevision?: number;
  readerCurrentText?: string;
  readerPassages?: readonly string[];
  readerPageIndex?: number;
  readerPageAnchor?: ReaderSemanticAnchor | null;
}>;

export type ReaderCursor = Readonly<{
  storyId: string;
  storyContentVersion: number;
  narrativeRevision: number;
  pageIndex: number;
  pageAnchor: ReaderSemanticAnchor | null;
}>;

export type StorySaveCorruptionReason =
  | 'invalid-json'
  | 'invalid-shape'
  | 'story-id-mismatch';

export type StorySaveLoadResult =
  | Readonly<{status: 'not-found'}>
  | Readonly<{status: 'loaded'; save: StorySave}>
  | Readonly<{
      status: 'corrupted';
      reason: StorySaveCorruptionReason;
    }>;

export type ReaderCursorLoadResult =
  | Readonly<{status: 'not-found'}>
  | Readonly<{status: 'loaded'; cursor: ReaderCursor}>
  | Readonly<{
      status: 'corrupted';
      reason: StorySaveCorruptionReason;
    }>;

const STORAGE_KEY_PREFIX = 'text-quest-anthology.story-save.';
const READER_CURSOR_KEY_PREFIX = 'text-quest-anthology.reader-cursor.';

export class StorySaveRepository {
  constructor(private readonly storage: StorySaveStorage) {}

  async load(storyId: string): Promise<StorySaveLoadResult> {
    const payload = await this.storage.getItem(this.storageKey(storyId));

    if (payload === null) {
      return {status: 'not-found'};
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(payload);
    } catch {
      return {status: 'corrupted', reason: 'invalid-json'};
    }

    if (!isStorySave(parsed)) {
      return {status: 'corrupted', reason: 'invalid-shape'};
    }

    if (parsed.storyId !== storyId) {
      return {status: 'corrupted', reason: 'story-id-mismatch'};
    }

    return {status: 'loaded', save: parsed};
  }

  async save(storyId: string, save: StorySave): Promise<void> {
    if (!isStorySave(save) || save.storyId !== storyId) {
      throw new Error(
        `INVALID_STORY_SAVE: Save payload does not match story id "${storyId}".`,
      );
    }

    await this.storage.setItem(this.storageKey(storyId), JSON.stringify(save));
  }

  async loadReaderCursor(storyId: string): Promise<ReaderCursorLoadResult> {
    const payload = await this.storage.getItem(this.readerCursorKey(storyId));

    if (payload === null) {
      return {status: 'not-found'};
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(payload);
    } catch {
      return {status: 'corrupted', reason: 'invalid-json'};
    }

    if (!isReaderCursor(parsed)) {
      return {status: 'corrupted', reason: 'invalid-shape'};
    }

    if (parsed.storyId !== storyId) {
      return {status: 'corrupted', reason: 'story-id-mismatch'};
    }

    return {status: 'loaded', cursor: parsed};
  }

  async saveReaderCursor(
    storyId: string,
    cursor: ReaderCursor,
    durable = false,
  ): Promise<void> {
    if (!isReaderCursor(cursor) || cursor.storyId !== storyId) {
      throw new Error(
        `INVALID_READER_CURSOR: Cursor payload does not match story id "${storyId}".`,
      );
    }

    const key = this.readerCursorKey(storyId);
    const payload = JSON.stringify(cursor);

    if (!durable && this.storage.setItemDeferred) {
      await this.storage.setItemDeferred(key, payload);
      return;
    }

    await this.storage.setItem(key, payload);
  }

  async deleteReaderCursor(storyId: string): Promise<void> {
    await this.storage.removeItem(this.readerCursorKey(storyId));
  }

  async delete(storyId: string): Promise<void> {
    let firstFailure: unknown = null;

    try {
      await this.storage.removeItem(this.storageKey(storyId));
    } catch (error) {
      firstFailure = error;
    }

    try {
      await this.storage.removeItem(this.readerCursorKey(storyId));
    } catch (error) {
      if (firstFailure === null) {
        firstFailure = error;
      }
    }

    if (firstFailure !== null) {
      throw firstFailure;
    }
  }

  private storageKey(storyId: string): string {
    return `${STORAGE_KEY_PREFIX}${storyId}`;
  }

  private readerCursorKey(storyId: string): string {
    return `${READER_CURSOR_KEY_PREFIX}${storyId}`;
  }
}

function isStorySave(value: unknown): value is StorySave {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.storyId !== 'string' ||
    value.storyId.length === 0 ||
    typeof value.storyContentVersion !== 'number' ||
    !Number.isInteger(value.storyContentVersion) ||
    value.storyContentVersion < 1 ||
    typeof value.runtimeState !== 'string' ||
    value.runtimeState.length === 0 ||
    !isTimestamp(value.startedAt) ||
    !isTimestamp(value.updatedAt) ||
    typeof value.completed !== 'boolean' ||
    !(
      value.endingId === null ||
      (typeof value.endingId === 'string' && value.endingId.length > 0)
    ) ||
    !isOptionalNarrativeRevision(value.narrativeRevision) ||
    !isOptionalText(value.readerCurrentText) ||
    !isReaderPassages(value.readerPassages) ||
    !isReaderPageIndex(value.readerPageIndex) ||
    !isOptionalReaderPageAnchor(value.readerPageAnchor)
  ) {
    return false;
  }

  if (!value.completed && value.endingId !== null) {
    return false;
  }

  return true;
}

function isReaderCursor(value: unknown): value is ReaderCursor {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.storyId === 'string' &&
    value.storyId.length > 0 &&
    typeof value.storyContentVersion === 'number' &&
    Number.isInteger(value.storyContentVersion) &&
    value.storyContentVersion >= 1 &&
    typeof value.narrativeRevision === 'number' &&
    Number.isInteger(value.narrativeRevision) &&
    value.narrativeRevision >= 0 &&
    typeof value.pageIndex === 'number' &&
    Number.isInteger(value.pageIndex) &&
    value.pageIndex >= 0 &&
    (value.pageAnchor === null || isReaderSemanticAnchor(value.pageAnchor))
  );
}

function isOptionalNarrativeRevision(
  value: unknown,
): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 0)
  );
}

function isOptionalText(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isReaderPassages(value: unknown): value is readonly string[] | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every(
        passage => typeof passage === 'string' && passage.trim().length > 0,
      ))
  );
}

function isReaderPageIndex(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 0)
  );
}

function isOptionalReaderPageAnchor(
  value: unknown,
): value is ReaderSemanticAnchor | null | undefined {
  return value === undefined || value === null || isReaderSemanticAnchor(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}
