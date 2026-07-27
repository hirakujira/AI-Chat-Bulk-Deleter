# AI Chat Bulk Deleter

A Chrome extension to batch delete conversations on **ChatGPT**, **Gemini**, **Claude**, and **Grok** directly from the web UI. It drives the page's own controls (open menu, click delete, and confirm when the site provides a confirmation step), so it never uses private APIs or touches your account tokens.

## Features

- Works on ChatGPT (`chatgpt.com`, `chat.openai.com`), Gemini (`gemini.google.com`), Claude (`claude.ai`), and Grok (`grok.com`).
- Scan the sidebar and pick exactly which conversations to delete with checkboxes.
- A single checkbox to select or clear all scanned conversations at once.
- A final warning confirms the platform and selected count before any deletion starts.
- Automatic rescan after deletion so the list stays in sync.
- Localized UI: English, Traditional Chinese, Simplified Chinese, Japanese.
- Panel appears only when you click the toolbar icon, and closes with the ✕ button.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this project folder.
4. Open a supported chat site and click the extension icon to toggle the panel.

## Usage

1. Click the extension icon to open the panel (top-right of the page).
2. Press **Scan** to list the conversations currently loaded in the sidebar.
3. Tick the conversations to remove (or **Select all**).
4. Press **Delete selected**.
5. Review the warning and confirm the platform and selected count.

Deletion is irreversible. Grok deletes a conversation immediately after its Delete menu item is clicked; it does not show a second confirmation dialog. Only conversations already loaded in the sidebar are scanned, so scroll the sidebar to load more before scanning.

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
