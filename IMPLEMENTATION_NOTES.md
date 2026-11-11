# Implementation notes

## Small technical stack

- React + TypeScript + Vite
- Dexie / IndexedDB for local browser storage
- `vite-plugin-pwa` for installability and offline app shell
- `MediaRecorder` for audio capture
- `JSZip` for portable ZIP packages
- Web Share API for native sharing, with download fallback

## Keep the architecture small

- `src/App.tsx`: minimal application shell
- `src/db.ts`: local IndexedDB store
- `src/academyAdapter.ts`: only place that maps between Workbench records and the real Academy schema
- `src/export.ts`: backup and submission package creation/sharing
- `src/recording.ts`: browser audio recording helper

Do not add a backend unless a real requirement emerges. Do not add a state-management framework for this small app.

## Data safety

- Save changes locally as they happen.
- Display whether changes are saved.
- Never overwrite an existing recording without explicit confirmation.
- Export a portable backup regularly.
- Import must detect duplicate IDs and conflicting revisions; do not silently overwrite.
- Keep submission ZIP creation separate from full workspace backup.
- A ZIP handed to another app is not proof of delivery.

## Academy integration gate

The exact Academy schema is not included in this starter. Confirm the current files and metadata in the Academy repository before implementing `academyAdapter.ts`. Do not assume old paths or field names are still current.
