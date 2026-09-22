# project_tracking
An app to easily track my hours, projects, and progress.

## Current MVP

This repository now includes a no-build web MVP in [app/index.html](app/index.html) with:

- Five pages: Time Tracking, Dashboard, Project Tracker, Settings, Notes
- Keyboard-first navigation and command palette
- Compact boundary entry for date, quarter-hour start time, contract, project, and task
- Context-aware AM/PM inference with an explicit override
- Contract/project selection with reserved None contract and project
- Raw timestamps plus quarter-hour rounded durations
- Multi-day, sticky-grouped history with spreadsheet-style inline editing and deletion
- Autosaving daily project journal with quick day navigation and section cycling
- Dashboard range filters, time-by-contract visualization, and wage/tax earnings estimates
- Notes browser filtered by contract and optional project
- CSV-backed time-entry persistence with automatic sync after connecting a file
- Windows desktop host via WPF + WebView2

## Run in Safari with persistent CSV

From the repository root, run:

```sh
python3 hours_pilot_server.py
```

Then open [http://127.0.0.1:8765/app/](http://127.0.0.1:8765/app/) in Safari. The server is localhost-only and persists entries to `~/Documents/hours-pilot.csv` by default. Choose another `.csv` path in Settings and select **Use CSV** to remember it locally.

For a different initial path or port:

```sh
python3 hours_pilot_server.py --csv ~/Documents/client-hours.csv --port 8766
```

Opening `app/index.html` directly remains useful for quick static previews, but Safari cannot continuously write a selected local CSV from a browser-only page.

## Run As Desktop App (Windows)
yes
Desktop host project:

- [desktop/HoursPilot.Desktop/HoursPilot.Desktop.csproj](desktop/HoursPilot.Desktop/HoursPilot.Desktop.csproj)

Build and run:

```powershell
cd C:/Users/dalli/source/repos/project_tracking/desktop/HoursPilot.Desktop
dotnet run
```

The desktop app uses WebView2 and loads the web app files bundled from [app/index.html](app/index.html).

## CSV Backend

The Safari local server is the recommended CSV backend. It serves the UI and API from the same localhost origin, so the browser never receives general filesystem access. The server remembers the configured CSV path in `~/.hours-pilot/config.json` and uses atomic replacement when writing CSV updates.

The Windows WebView2 host and Chromium File System Access API paths remain supported as alternatives.

## Keyboard Shortcuts

- `Ctrl+K` open command palette
- `Ctrl+Tab` cycle through Time Tracking, Dashboard, Project Tracker, Settings, and Notes
- `Ctrl+Shift+Tab` cycle backward through pages
- `G` then `T`/`D`/`J`/`S`/`N` go to Time/Reports/Journal/Settings/Notes
- `Ctrl+N` focus a new time entry
- `Enter` in the task field saves and returns to the selected hour
- `Ctrl+Enter` moves to the next journal section and cycles after the last
- `Left`/`Right` changes journal days when focus is outside an editor
- `Ctrl+Delete` deletes the focused history row
- `Ctrl+Z` undo last edit
- `Tab` from outside page content jumps to the first input on the active page
- `?` open shortcuts panel
