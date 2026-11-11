# Product specification

## Purpose

Give one or two invited linguistic experts a very simple way to review Meitei Mayek Academy material, record pronunciations, and return their work as a file.

## Primary workflow

1. Open the Workbench link on a phone, tablet, or computer.
2. Select a content item supplied by the Academy.
3. Review the linguistic fields and add corrections or notes.
4. Record one or more pronunciation samples, listen, and keep or retake them.
5. Export a review ZIP and share it through WhatsApp, email, or another available app.
6. The Academy owner validates the package and imports approved changes.

## Screens

### Home
- Short explanation and current local-work status.
- Buttons: `Open review`, `Import review items`, `Export backup`, `Prepare submission`.
- A clear reminder that work is stored on this device.

### Review
- Simple list of assigned records.
- Record details: glyph, stable record ID, category, and Unicode identity shown read-only.
- Editable linguistic fields only where the Academy schema allows them.
- Clear distinctions between “not reviewed”, “needs clarification”, and “reviewed”.
- Save automatically, with visible save status.

### Pronunciation
- Record, stop, play, delete/retake.
- Allow more than one pronunciation where needed.
- Keep the original recording; do not silently convert or compress it.
- Store recording MIME type, duration, and associated record/pronunciation IDs.

### Share
- Validate the batch.
- Show what is included and package size.
- `Share review ZIP` uses the device share sheet when supported.
- Otherwise, download the ZIP for manual attachment.
- Do not claim that a package was delivered or received.

## Content and approval principles

- Character identity (including Unicode code points/sequences) is read-only in the expert editor.
- Never infer or invent names, sounds, pronunciations, examples, or writing rules.
- Multiple valid pronunciations must be representable.
- Linguistic review and audio review are separate decisions.
- Empty fields do not mean “does not exist”.
- Keep expert notes and local operational metadata separate from publishable Academy content.
- The Academy owner remains responsible for final validation and publication.

## Device behaviour

- Responsive layout; one-column on phones, comfortable two-pane layout on wide screens.
- Use browser feature detection rather than browser-name detection.
- Microphone recording requires permission and a secure context.
- File sharing support varies by browser and operating system. Always provide a download fallback.
- Local browser data does not automatically move between devices. Use `Export backup` and `Import backup`.

## Explicitly out of scope

- Google login or Google Drive.
- Expert accounts, permissions, or multi-user collaboration.
- Cloud database or automatic sync.
- Direct automatic sending to WhatsApp/email.
- Automatic Academy publishing.
- AI-generated linguistic content.
- Complex dashboards, analytics, or project management.
