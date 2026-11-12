# Meitei Mayek Linguistic Review Workbench

An independent, local-first review tool for one or two linguistic experts. Import assigned records, review their linguistic details, record and replay pronunciation samples, and return a review ZIP to the Academy owner.

## Use the Workbench

Open the deployed HTTPS link. On the first visit in a browser, the Workbench automatically loads the focused review queue (48 records) from `public/review-items.json`. The expert can begin in **Review workspace** immediately.

- Review fields: glyph, Unicode sequence, character name, pronunciation, writing notes, syllable/combination examples, variants and source references.
- Linguistic review and audio review have separate statuses.
- Audio: record multiple samples, replay them, and delete a sample.
- Backup: export and restore all local items and recordings.
- Submission: export/share a ZIP containing review data and original audio.

## Important data behaviour

- No account, backend, cloud database or automatic sync.
- Data is stored in IndexedDB in the current browser on the current device.
- Export a backup regularly and before clearing browser data or changing devices.
- Backup restore merges by stable record ID; it does not overwrite existing IDs.
- The share sheet hands the file to the selected app; it does not prove delivery.
- Do not enter personal or confidential information into review notes.

## Import format

The initial project dataset contains 27 core letters, 8 lonsum/consonants, 8 Cheitap/vowels, 3 other signs, one combination task and one pronunciation task. It is maintained in `public/review-items.json`. For additional batches, use **Download JSON template** in the app. Each record must have a stable, unique `id`. The format is:

```json
{
  "format": "mayek-workbench-items",
  "version": 1,
  "items": [
    {
      "id": "stable-source-record-id",
      "category": "",
      "glyph": "",
      "unicodeSequence": "",
      "displayLabel": "",
      "letterName": "",
      "pronunciation": "",
      "writingNotes": "",
      "syllableExamples": "",
      "variantNotes": "",
      "sourceReference": "",
      "reviewStatus": "not_reviewed",
      "audioReviewStatus": "not_reviewed",
      "expertNotes": ""
    }
  ]
}
```

Duplicate IDs are skipped on import; existing records are never silently overwritten. The JSON import uses this Workbench format and does not guess the Academy data schema.

## Review submission

The submission ZIP includes `review-items.json`, `audio-index.json`, and the original audio recordings. It is a Workbench review package, not a direct Academy import file. The Academy owner validates and applies approved changes separately.

## Run locally

Requirements: Node.js 20+ and npm. Do not upload `node_modules`; npm recreates it from the package manifest.

```powershell
npm install
npm run dev
```

## Build

```powershell
npm run build
npm run preview
```

## GitHub Pages

This repository is configured to deploy automatically from the `main` branch using GitHub Actions. In repository settings, set **Settings → Pages → Build and deployment → Source → GitHub Actions**.

**Expert-facing link:**

https://ngangom01.github.io/meitei-mayek-linguistic-workbench/

The GitHub repository page displays source code; share the `github.io` link above with the expert.

## Privacy and browser support

Microphone access requires HTTPS (or localhost during development) and permission. Recordings are not uploaded by the app. Browser storage can be cleared by the browser or device, so backups are essential. Use a current browser such as Chrome, Edge or Safari.
