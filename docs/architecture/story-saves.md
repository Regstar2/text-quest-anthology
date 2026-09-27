# Local story saves

## Scope

The MVP keeps one current local narrative save per story plus a lightweight reader-cursor sidecar. Saves are offline-only and are not synchronized with any account, backend or cloud service.

Android persistence uses a small React Native native module backed by `SharedPreferences`. The TypeScript narrative layer depends only on `StorySaveStorage`/`StorySaveRepository`, so it does not depend on Android APIs or a database model.

## Narrative save contract

The durable narrative JSON record contains:

- `storyId`;
- `storyContentVersion`;
- serialized Ink `runtimeState`;
- `startedAt`;
- `updatedAt`;
- `completed`;
- `endingId` (`null` until no terminal ending is known);
- `narrativeRevision`;
- the accumulated reader transcript and the cursor position current at the last narrative checkpoint.

A narrative save is written for a fresh session, after an actual narrative mutation such as a choice or restart, and when a lifecycle flush finds unsaved narrative state. Ordinary next/previous page navigation never exports Ink state or serializes the transcript.

## Reader cursor sidecar

The cursor sidecar contains only:

- `storyId`;
- `storyContentVersion`;
- `narrativeRevision`;
- physical `pageIndex`;
- semantic `pageAnchor`.

Ordinary page turns update this sidecar after a short debounce. Rapid turns are coalesced, and React does not wait for the write before showing the target page.

On Android, ordinary sidecar writes use `SharedPreferences.Editor.apply()`, while durable narrative checkpoints continue to use `commit()`. Lifecycle `flush()` forces the current cursor through the durable path when no narrative save is pending.

A sidecar is applied on resume only when both `storyContentVersion` and `narrativeRevision` match the durable narrative save. A stale or corrupted cursor can therefore change neither Ink state nor narrative outcome; it is ignored and removed best-effort.

Storage keys are namespaced by story id. Deleting or restarting one story removes both its narrative save and its cursor without enumerating state belonging to other stories.

## UI and lifecycle ordering

`StorySession.choose()` mutates the in-memory Ink runtime and exposes the new reader snapshot immediately. Full persistence is deferred to the next task, so React can commit the new text before expensive Ink export, transcript serialization and disk persistence run.

`StorySession.setPage()` changes only the in-memory cursor and schedules the lightweight sidecar write. It does not create a full reader snapshot unless a legacy caller explicitly awaits the compatibility result.

When React Native reports `inactive` or `background`:

- unsaved narrative state is persisted as a full durable save;
- otherwise only the small current reader cursor is durably flushed.

Restart waits for outstanding persistence, removes the selected story state, creates a new runtime from the story package and persists the fresh initial narrative state.

## Recovery rules

- missing narrative key: start normally and discard any orphan cursor best-effort;
- invalid narrative JSON or invalid record shape: treat as corrupted, remove story state best-effort and start fresh;
- story id mismatch: treat the narrative save as corrupted;
- incompatible `storyContentVersion`: remove story state best-effort and start fresh with an explicit UI message;
- Ink state import failure or inconsistent completion metadata: treat as corrupted;
- stale/corrupted cursor: ignore it, keep the valid narrative save and remove only the cursor best-effort;
- storage read/write failure: keep the in-memory session usable and surface a non-fatal UI message when the failing path is observable.

Legacy saves without `narrativeRevision` or reader fields remain loadable; revision `0` is used until the next narrative save. There is intentionally no generic migration framework in this version.
