export type StorySaveStorage = Readonly<{
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
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

const STORAGE_KEY_PREFIX = 'text-quest-anthology.story-save.';

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

  async delete(storyId: string): Promise<void> {
    await this.storage.removeItem(this.storageKey(storyId));
  }

  private storageKey(storyId: string): string {
    return `${STORAGE_KEY_PREFIX}${storyId}`;
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
    )
  ) {
    return false;
  }

  if (!value.completed && value.endingId !== null) {
    return false;
  }

  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}
