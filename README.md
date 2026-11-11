# Meitei Mayek Linguistic Review Workbench

A small, local-first tool for **one or two linguistic experts** to review Academy content, record pronunciations, and send review packages to the Academy owner.

## Product decisions

- No accounts, login, roles, backend, database server, or cloud sync.
- Works as an installable, responsive web app (PWA).
- Designed for phones, tablets, and desktop browsers.
- Drafts and recordings stay in the current browser on the current device.
- Expert can export a portable backup to move work to another device.
- Expert can export a review ZIP and share it using the device share sheet, or download it.
- No Google Drive integration.
- No automatic publishing. The Academy owner checks and imports submissions.
- Keep the expert workflow to: **Open → Review → Record → Share**.

## Important limitation

Browser storage is local to each device/browser. It is not synchronised. The expert should export a backup before changing devices or clearing browser data. The share sheet only hands the package to the selected app; it does not confirm that the recipient received it.

## Start locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open the local URL shown by Vite. Microphone recording and native file sharing require a secure context (HTTPS, or localhost during development).

## Build

```bash
npm run build
npm run preview
```

Deploy the `dist/` folder to any static HTTPS host. GitHub Pages is suitable once the base path is configured for the repository.

## Before using real Academy content

Do not invent or hard-code linguistic data. The current starter uses an empty workspace. Before connecting Academy content:

1. Confirm the current Academy content schema and audio metadata from the Academy repository.
2. Implement the adapter in `src/academyAdapter.ts` to match that schema exactly.
3. Import the approved Academy character/combination records.
4. Test an exported package against the Academy's validation/import process.

The Workbench must not create a competing Academy content schema. The sample export envelope in this starter is a transport format only; the `content` payload must be replaced by the approved Academy schema adapter.

## Project scope

This is deliberately not a collaboration platform. There is no user management, live multi-device sync, comments system, cloud service, analytics, or complex workflow engine.
