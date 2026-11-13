# Read & Grow

A personal reading library and learning journal. **Don't just read. Retain, reflect, and apply.**

## Use it

Open [Read & Grow](https://jvzaki.github.io/read-and-grow/), add a book, and record your pages, minutes, and a reflection. Browse your insights in the Knowledge Vault.

- Dashboard with reading totals, streaks, and a daily minutes goal.
- Searchable library with reading statuses, generated covers, and optional cover URLs.
- Reading sessions with mandatory learning reflections and optional application notes.
- Session editing and deletion automatically recalculate progress and statistics.
- Validated JSON export and import in Settings.

Data stays in your browser's localStorage. It does not sync across devices. Clearing browser data can erase it; export regular backups. Import replaces existing data after confirmation. Deleting a book also deletes its sessions and reflections after confirmation.

## Run locally

Serve the repository root with any static HTTP server, or open `index.html` directly. Use a consistent browser and URL for persistent data; browser storage for local files varies by browser. No installation, build, account, or API key is needed.

The application uses only `index.html`, `styles.css`, and `script.js`. Google Fonts enhance typography when available; system and serif fallbacks work without them. Cover images are loaded only from URLs provided by the user.

## Progress and dates

Pages and reading time are calculated from saved sessions. Progress cannot exceed a book's total. Reaching the total automatically displays a book as Finished; reducing its logged pages reverses automatic completion. Books explicitly marked Finished remain in that category until edited. Books marked Want to Read display as Currently Reading once they have sessions.

Streaks use distinct local calendar dates. A streak remains active if the latest reading day was yesterday. Sessions support dates from January 1, 1900 through today, whole positive page counts, and 1–1,440 minutes. New libraries default to a 20-minute daily goal.

## GitHub Pages

Publish the `main` branch from `/ (root)`. All application asset paths are relative and support `/read-and-grow/`. There is no routing server or build step.
