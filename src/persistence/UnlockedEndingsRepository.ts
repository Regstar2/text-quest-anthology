import type {StorySaveStorage} from './StorySaveRepository';

export type UnlockedEnding = Readonly<{
  id: string;
  text: string;
  unlockedAt: string;
}>;

type Clock = () => Date;
const systemClock: Clock = () => new Date();
const STORAGE_KEY_PREFIX = 'text-quest-anthology.unlocked-endings.v1.';

export class UnlockedEndingsRepository {
  constructor(
    private readonly storage: StorySaveStorage,
    private readonly clock: Clock = systemClock,
  ) {}

  async list(storyId: string): Promise<readonly UnlockedEnding[]> {
    const payload = await this.storage.getItem(this.storageKey(storyId));

    if (payload === null) {
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(payload);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter(isUnlockedEnding);
    } catch {
      return [];
    }
  }

  async count(storyId: string): Promise<number> {
    return (await this.list(storyId)).length;
  }

  async unlock(
    storyId: string,
    ending: Readonly<{id: string; text: string}>,
  ): Promise<readonly UnlockedEnding[]> {
    if (storyId.trim().length === 0 || ending.id.trim().length === 0) {
      throw new Error('INVALID_UNLOCKED_ENDING');
    }

    const current = await this.list(storyId);
    if (current.some(item => item.id === ending.id)) {
      return current;
    }

    const next: UnlockedEnding[] = [
      ...current,
      {
        id: ending.id,
        text: ending.text.trim(),
        unlockedAt: this.clock().toISOString(),
      },
    ];

    await this.storage.setItem(this.storageKey(storyId), JSON.stringify(next));
    return next;
  }

  private storageKey(storyId: string): string {
    return `${STORAGE_KEY_PREFIX}${storyId}`;
  }
}

function isUnlockedEnding(value: unknown): value is UnlockedEnding {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    record.id.length > 0 &&
    typeof record.text === 'string' &&
    typeof record.unlockedAt === 'string' &&
    !Number.isNaN(Date.parse(record.unlockedAt))
  );
}
