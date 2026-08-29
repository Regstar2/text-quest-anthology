import type {StorySaveStorage} from './StorySaveRepository';

export type ReaderMode = 'pages' | 'feed';
export type ReaderTheme = 'auto' | 'light' | 'sepia' | 'dark' | 'oled';

export type ReaderPreferences = Readonly<{
  mode: ReaderMode;
  theme: ReaderTheme;
}>;

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  mode: 'pages',
  theme: 'auto',
};

const STORAGE_KEY = 'text-quest-anthology.reader-preferences.v1';

export class ReaderPreferencesRepository {
  constructor(private readonly storage: StorySaveStorage) {}

  async load(): Promise<ReaderPreferences> {
    const payload = await this.storage.getItem(STORAGE_KEY);

    if (payload === null) {
      return DEFAULT_READER_PREFERENCES;
    }

    try {
      const parsed: unknown = JSON.parse(payload);
      return isReaderPreferences(parsed)
        ? parsed
        : DEFAULT_READER_PREFERENCES;
    } catch {
      return DEFAULT_READER_PREFERENCES;
    }
  }

  async save(preferences: ReaderPreferences): Promise<void> {
    if (!isReaderPreferences(preferences)) {
      throw new Error('INVALID_READER_PREFERENCES');
    }

    await this.storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }
}

function isReaderPreferences(value: unknown): value is ReaderPreferences {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return isReaderMode(record.mode) && isReaderTheme(record.theme);
}

function isReaderMode(value: unknown): value is ReaderMode {
  return value === 'pages' || value === 'feed';
}

function isReaderTheme(value: unknown): value is ReaderTheme {
  return (
    value === 'auto' ||
    value === 'light' ||
    value === 'sepia' ||
    value === 'dark' ||
    value === 'oled'
  );
}
