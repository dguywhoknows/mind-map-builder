# mind-map-builder

[![tests](https://github.com/dguywhoknows/mind-map-builder/actions/workflows/tests.yml/badge.svg)](https://github.com/dguywhoknows/mind-map-builder/actions/workflows/tests.yml)

Grow an endless, AI-expanded mind map from any topic, with radial layout, pan/zoom and export.

Live: https://dguywhoknows.github.io/mind-map-builder/

## Overview

Type a topic and get a balanced, MECE-style mind map. Click any node to expand it with fresh sub-ideas, get a short explanation, or take a quick quiz on it. The map is laid out radially by a hand-written algorithm that weights each branch by its leaf count, and it saves itself to your browser.

## Pages

- **Map**
- **Settings**

## Features

- Radial tree layout weighted by subtree leaf count, color-coded per branch
- Infinite canvas: drag to pan, scroll to zoom, fit-to-screen
- Per-node AI actions: Expand, Explain, Quiz me
- Manual editing: rename (double-click), add, delete, fold/unfold branches
- Autosaves to localStorage
- Export to Markdown outline, JSON, SVG or high-DPI PNG
- Undo / redo for every edit (bounded snapshot history, Ctrl+Z / Ctrl+Y)
- Drag a node onto another to re-parent it, with cycle protection
- Search with accent-insensitive matching across titles and notes; Enter cycles and centers matches
- Import any Markdown / numbered / indented outline as a map
- Export to a JSON flashcard deck
- AI essay outline generated from the map structure
- Editable notes per node

## How it works

LLM calls are used for:

- JSON-mode generation of the initial tree at a chosen depth
- Context-aware expansion: the model sees the full path and existing siblings to avoid repeats
- Short Markdown explanations and recall questions per node
- Map → structured essay outline (thesis, sections, transitions)

Everything else (layout, rendering, pan/zoom, editing, persistence and image export) runs locally in the browser.

## Getting started

No build step and no dependencies. Serve the folder with any static server:

```bash
git clone https://github.com/dguywhoknows/mind-map-builder.git
cd mind-map-builder
python -m http.server 8000
```

Then open http://localhost:8000.

`index.html` is the public home page, `login.html` handles accounts and `app.html` is the app.

### Telling the app what to do

Every page has an **Ask AI** box (Ctrl/Cmd+K). Type a request in plain words and the model plans a sequence of
calls to the app's own functions, runs them and reports back. The **Instructions** tab stores standing
preferences that are added to every AI request the app makes.

### Configuration

`src/lib/config.js` is generated from the build settings: the Supabase project (accounts) and the AI proxy URL.
Signed-in users get the built-in AI through the proxy, which keeps the provider key as a server-side secret.
Without those settings the app runs for guests, in demo mode, or with a personal [Groq](https://console.groq.com/keys)
or [OpenRouter](https://openrouter.ai/keys) key entered under **Settings → Model provider** (stored only in this
browser and sent only to that provider).

## Testing

`src/core.js` holds the app's logic as pure functions and is covered by 12 unit tests.

```bash
node tests/run-node.js        # CI runs this on every push
```

Or open `tests/index.html` in a browser ([live](https://dguywhoknows.github.io/mind-map-builder/tests/)).

## Project structure

```
index.html           public home page (generated)
login.html           sign-in and sign-up (generated)
app.html             the app: markup for every page
src/app.js           UI, page wiring and event handlers
src/core.js          pure logic with no DOM access (unit-tested)
src/demo.js          sample responses used when no API key is configured
src/lib/ai.js        LLM client: Groq / OpenRouter, streaming, JSON mode, retries
src/lib/dom.js       DOM helpers, namespaced storage, markdown renderer
src/lib/router.js    hash router and the Settings page
src/lib/copilot.js   AI command box that drives the app's own functions
src/lib/auth.js      accounts (Supabase Auth) and the sign-in gate
styles/base.css      design tokens and shared components
styles/app.css       app-specific styles
tests/               unit tests (browser runner + Node runner for CI)
```

## Tech

- SVG rendering with no chart library
- Computed-style inlining for standalone SVG/PNG export
- Pointer Events pan + cursor-anchored wheel zoom
- Pure tree algorithms (layout, move, search, outline parser) in core.js with unit tests in CI
- Vanilla JavaScript, no framework or bundler
- Deployed with GitHub Pages

## License

MIT
