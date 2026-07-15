# AGENTS.md

Notes for AI coding agents (OpenCode, Codex, Cursor, Aider, Devin, Gemini CLI, …)
working on this repo. Human contributors: skim the **Build / Test** section.

## Project summary

Browser-based save editor for the game **Fortune Mill**.

- **Stack:** vanilla JS, HTML, CSS. No build step, no package manager, no deps.
- **Runtime targets:** modern Chromium browsers (File System Access API used
  optionally), Firefox, Safari. No transpilation.
- **Companion tools:** Python 3.10+ CLI scripts that share the same on-disk
  format. They live in `tools/` and are **not** shipped to the web page.

## Repo layout

| Path                | Purpose                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `index.html`        | The web app entry point. Open this directly, or via a local server.    |
| `css/style.css`     | All styles. Single file, no preprocessor.                               |
| `js/format.js`      | **Schema** — single source of truth for the field order / types.        |
| `js/codec.js`       | Binary read/write for the `.sav` format.                                |
| `js/app.js`         | UI: editor, sidebar groups, modals, drag-and-drop, round-trip check.     |
| `tools/*.py`        | Python CLI equivalents of the parser/writer.                            |
| `tools/*.bat`       | Windows wrappers around the Python tools.                               |
| `tests/*_test.js`   | Node-only tests for the codec. **Not** loaded by `index.html`.          |
| `README.md`         | User-facing docs.                                                       |

> `js/format.js` is authoritative. The Python tools must mirror it in the
> same order, and any change must include a corresponding change in both.

## Build / Test

There is **no build step.** The web app is served as static files.

```bash
# Serve locally (recommended; required for the File System Access API).
python -m http.server 8000
# open http://localhost:8000

# Or just double-click index.html — works for everything except the
# "Write to game folder…" optional feature.

# Run the codec tests (Node 18+).
node tests/_roundtrip_test.js
node tests/_smoke_test.js
node tests/_real_test.js     # needs a real save_game.sav next to it
node tests/_trace_test.js    # dumps every field offset / value
```

## Conventions

- **No build tools.** Do not introduce TypeScript, bundlers, npm, or
  package.json. If a task seems to need them, push back and propose a
  vanilla solution.
- **No external runtime deps.** No CDN scripts, no fonts loaded from the
  network. The page should work fully offline.
- **Schema changes** are high-impact. If you add, remove, or reorder a
  field in `js/format.js`:
  1. Update the Python dumper and writer in lock-step.
  2. Add a regression test in `tests/`.
  3. Note the offset shift in the commit message.
- **UI language.** Buttons, labels, and modals are in English. Keep them
  short and consistent with the existing tone.
- **Comments.** Comments in the JS files explain *why*, not *what*. Follow
  the existing style.

## Save format invariants

These must hold in **both** the JS and Python implementations:

- `INT_OFFSET = 65536` (0x10000). Ints/longs are stored as `value + 65536`.
- Little-endian everywhere.
- `bigint`: 4 bytes length (u32, little-endian), then N bytes of
  little-endian two's-complement payload — compatible with .NET's
  `new BigInteger(byte[])` constructor.
- `bool`: 1 byte. `0` is false; any other value is true. Do not compare
  against `1` when reading.
- The `version` field is the only raw `u32` (no offset). It is always
  field 0 in the schema.

## Common tasks

- **Add a new field.** Add it in `js/format.js` (and update the Python
  tool), then add a test in `tests/_smoke_test.js`.
- **Change a label or hint.** UI-only change in `js/format.js`
  (`displayName`, `hint`).
- **Reorder fields.** High-risk — offsets shift. Update everything,
  re-run all four tests, and note the new offsets in the commit.
- **Add a UI control type.** Touch `js/app.js` (rendering) and
  `css/style.css` (styling). Don't change the codec.

## Things to avoid

- ❌ Don't add a `package.json`, bundler, or framework. The whole point is
  that this is a zero-dependency page.
- ❌ Don't use `eval`, `new Function`, or any dynamic code execution
  inside the codec. The codec is security-sensitive: it parses untrusted
  bytes from a save file.
- ❌ Don't use `localStorage` / `IndexedDB` to store save contents. The
  app is supposed to be ephemeral — the user always has the file in
  their hands.
- ❌ Don't change field offsets silently. Every offset is observed by
  test snapshots.

## Communication

- The user speaks Spanish. Reply in Spanish for conversation; keep code
  comments and identifiers in English.
- The user prefers discussing the design briefly before non-trivial
  changes. Don't jump straight to code on multi-field edits.

## Active work

None right now. The project is in a steady state — the schema mirrors the
in-game format, all four tests pass, and the GitHub Pages deployment is
the published artifact.
