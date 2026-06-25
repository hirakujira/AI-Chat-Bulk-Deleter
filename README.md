# AI Chat Bulk Deleter

A Chrome extension to batch delete conversations on **ChatGPT** and **Gemini** directly from the web UI. It drives the page's own controls (open menu, click delete, confirm), so it never uses private APIs or touches your account tokens.

## Features

- Works on ChatGPT (`chatgpt.com`, `chat.openai.com`) and Gemini (`gemini.google.com`).
- Scan the sidebar and pick exactly which conversations to delete with checkboxes.
- Select all / clear, plus pause and stop while a batch is running.
- Automatic rescan after deletion so the list stays in sync.
- Localized UI: English, Traditional Chinese, Simplified Chinese, Japanese.
- Panel appears only when you click the toolbar icon, and closes with the ✕ button.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this project folder.
4. Open ChatGPT or Gemini and click the extension icon to toggle the panel.

## Usage

1. Click the extension icon to open the panel (top-right of the page).
2. Press **Scan** to list the conversations currently loaded in the sidebar.
3. Tick the conversations to remove (or **Select all**).
4. Press **Delete selected**. Use **Pause** / **Stop** as needed.

Deletion is irreversible. Only conversations already loaded in the sidebar are scanned, so scroll the sidebar to load more before scanning.

## Development

UI selectors and pure helpers live in `src/selectors.js` and are unit tested:

```bash
node --test
```

## Project layout

```
manifest.json          Manifest V3 config
src/selectors.js       Per-platform selectors + pure helpers (tested)
src/content.js         Panel UI and UI-driven deletion flow
src/background.js      Toggles the panel when the toolbar icon is clicked
src/styles.css         Panel styles
_locales/              i18n messages (en, zh_TW, zh_CN, ja)
icons/                 Extension icons
test/                  Node test runner specs
```

## Privacy

The extension runs entirely in your browser, only on the supported chat sites, and only automates the existing web UI of your logged-in account. It does not collect, transmit, or store any data.
