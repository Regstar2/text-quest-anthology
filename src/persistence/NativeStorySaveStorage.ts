import {NativeModules} from 'react-native';
import {
  StorySaveRepository,
  type StorySaveStorage,
} from './StorySaveRepository';

type NativeStorySaveStorageModule = Readonly<{
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}>;

function nativeModule(): NativeStorySaveStorageModule {
  const module = NativeModules.StorySaveStorage as
    | NativeStorySaveStorageModule
    | undefined;

  if (!module) {
    throw new Error(
      'STORY_SAVE_NATIVE_MODULE_UNAVAILABLE: StorySaveStorage is not registered.',
    );
  }

  return module;
}

export const nativeStorySaveStorage: StorySaveStorage = {
  getItem: key => nativeModule().getItem(key),
  setItem: (key, value) => nativeModule().setItem(key, value),
  removeItem: key => nativeModule().removeItem(key),
};

export const storySaveRepository = new StorySaveRepository(
  nativeStorySaveStorage,
);
