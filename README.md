# Fortune Mill — Save Editor

A browser-based save editor for the game **Fortune Mill**. Open a `.sav` file, edit
any field with friendly controls (numbers, booleans, BigInts), then save it back
to a new `.sav` file that the game will accept.

> Vanilla JavaScript, no build step, no dependencies, no server.
> Runs entirely in the browser by opening `index.html`.

---

## ✨ Features

- **Open & save `.sav`** files directly (no upload — everything is local).
- **Grouped UI** by category (Currencies, Upgrades, Sushi, Zenith, …).
- **BigInt support** for the huge counters Fortune Mill uses (currency, fuel, tokens, …).
- **Round-trip check** button — verifies the parser and writer agree on the loaded bytes.
- **Raw dump view** — edit the underlying text dump if you prefer.
- **Drop zone** — drag a `.sav` onto the page to load it.
- **Optional direct write** to the game's save folder (File System Access API, Chromium-based browsers).

---

## 🚀 Quick start

### Use the hosted version (GitHub Pages)

Just open the published page and you're done — no install.

### Run locally

```bash
# Either:
# 1) double-click index.html, or
# 2) serve the folder (recommended, so the File System Access API works):
python -m http.server 8000
# then open http://localhost:8000
```

> ⚠️ Opening `index.html` via `file://` works for almost everything, but some
> browsers block the File System Access API on `file://`. Use a local server if
> "Write to game folder…" doesn't show up.

### Edit your save

1. Click **Open .sav** and pick your `save_game.sav`.
2. Edit any value. The status bar shows when you have unsaved changes.
3. Click **Save .sav** — the browser downloads `<name>.edited.sav`.
4. **Close the game first**, back up the original `save_game.sav`, then copy
   your edited file into the save folder, overwriting the original. Reopen
   the game.
5. Want to revert? Restore from the `.bak` file you made in step 4.

Default save locations:

| OS      | Path                                                                       |
| ------- | -------------------------------------------------------------------------- |
| Windows | `%APPDATA%\Godot\app_userdata\Fortune Mill\save_game.sav`                  |
| macOS   | `~/Library/Application Support/Godot/app_userdata/Fortune Mill/save_game.sav` |
| Linux   | `~/.local/share/godot/app_userdata/Fortune Mill/save_game.sav`             |

---

## 🧰 CLI tools (Python, optional)

The `tools/` folder contains Python equivalents of the parser/writer. Useful
if you want to script edits or you don't trust the JS round-trip.

| File                          | What it does                                                  |
| ----------------------------- | ------------------------------------------------------------- |
| `fortune_mill_dumper.py`      | Parses a `.sav` and writes a human-readable text dump.        |
| `fortune_mill_dump_to_sav.py` | Reads the text dump and rebuilds a `.sav`.                    |
| `dump_save.bat`               | Windows shortcut for the dumper.                              |
| `dump_to_sav.bat`             | Windows shortcut for the writer.                              |

```bash
# Dump your save to save_dump.txt
python tools/fortune_mill_dumper.py "%APPDATA%\Godot\app_userdata\Fortune Mill\save_game.sav" --txt save_dump.txt

# Edit save_dump.txt, then rebuild the .sav
python tools/fortune_mill_dump_to_sav.py save_dump.txt save_dump.sav
```

> Requires **Python 3.10+** (uses PEP 604 `int | str` syntax via `from __future__ import annotations`,
> but the runtime annotations need 3.10+ for the rest).

---

## 🧪 Tests

The `tests/` folder has Node-only smoke and round-trip tests for the codec.
They are **not** part of the web app — they're here to verify that the
JavaScript codec and the Python tools agree on the format.

```bash
node tests/_roundtrip_test.js
node tests/_smoke_test.js
node tests/_real_test.js     # needs a real save_game.sav next to it
node tests/_trace_test.js    # dumps every field offset / value
```

---

## 🗂️ Project layout

```
.
├── index.html             # The web app (open this)
├── css/
│   └── style.css
├── js/
│   ├── format.js          # Field schema (single source of truth for byte order)
│   ├── codec.js           # Read/write binary .sav
│   └── app.js             # UI: editor, sidebar, modals, drag-and-drop
├── tools/                 # CLI tools (Python + Windows .bat wrappers)
│   ├── fortune_mill_dumper.py
│   ├── fortune_mill_dump_to_sav.py
│   ├── dump_save.bat
│   └── dump_to_sav.bat
├── tests/                 # Node-only codec tests
│   ├── _smoke_test.js
│   ├── _real_test.js
│   ├── _roundtrip_test.js
│   └── _trace_test.js
├── AGENTS.md              # Notes for AI agents working on this repo
└── README.md
```

---

## 📦 Save format (cheat sheet)

Little-endian, identical to the Godot/.NET runtime.

| Type   | Wire size                                | Notes                              |
| ------ | ---------------------------------------- | ---------------------------------- |
| `u32`  | 4 bytes                                  | Raw uint32. Used for `version`.    |
| `i32`  | 4 bytes                                  | Stored as `value + 65536` u32.     |
| `i64`  | 8 bytes                                  | Stored as `value + 65536` u64.     |
| `bool` | 1 byte                                   | `0` = false, anything else = true. |
| `f64`  | 8 bytes                                  | IEEE 754 double.                   |
| `bigint`| 4 bytes length (u32) + N bytes payload   | .NET `BigInteger`, little-endian   |

`INT_OFFSET = 65536` everywhere.

---

## 🤝 Contributing

1. Edit the field you want to change in `js/format.js` (the schema is the
   single source of truth).
2. If the field is **also** read/written by the Python tools, update
   `tools/fortune_mill_dumper.py` and `tools/fortune_mill_dump_to_sav.py`
   in the same order, and add a test in `tests/`.
3. Run all four tests and confirm green.

PRs welcome.

---

## ⚖️ License

This is a fan-made save editor. Fortune Mill belongs to its respective
rights holders. Use at your own risk — always keep a `.bak` of your save.
