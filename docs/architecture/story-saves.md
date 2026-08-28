# Local story saves

## Scope

The MVP keeps one current local save per story. Saves are offline-only and are not synchronized with any account, backend or cloud service.

Android persistence uses a small React Native native module backed by `SharedPreferences`. The TypeScript narrative layer depends only on `StorySaveStorage`/`StorySaveRepository`, so it does not depend on Android APIs or a database model.

## Save contract

Each persisted JSON record contains:

- `storyId`;
- `storyContentVersion`;
- serialized Ink `runtimeState`;
- `startedAt`;
- `updatedAt`;
- `completed`;
- `endingId` (`null` until no terminal ending is known).

Storage keys are namespaced by story id. Deleting or restarting one story therefore does not enumerate or clear saves belonging to other stories.

## Lifecycle

`StorySession` owns the narrative lifecycle:

1. load the current story save;
2. validate its shape and story id;
3. compare `storyContentVersion` with the current story package;
4. create a new Ink runtime;
5. import the serialized Ink state when compatible;
6. verify that restored completion metadata matches the runtime snapshot.

A significant choice is autosaved after Ink advances. The current state is also flushed when React Native reports `inactive` or `background`.

Restart removes the selected story key, creates a new runtime from the story package and immediately persists that fresh initial state.

## Recovery rules

- missing key: start normally;
- invalid JSON or invalid record shape: treat as corrupted, remove it best-effort and start fresh;
- story id mismatch: treat as corrupted;
- incompatible `storyContentVersion`: remove it best-effort and start fresh with an explicit UI message;
- Ink state import failure or inconsistent completion metadata: treat as corrupted;
- storage read/write failure: keep the in-memory session usable and surface a non-fatal UI message.

There is intentionally no generic migration framework in this version. A future story may add an explicit migration only when a real compatibility requirement exists.
