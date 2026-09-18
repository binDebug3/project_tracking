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

## Run Locally

Open [app/index.html](app/index.html) in your browser.

For local HTTP hosting, from repository root:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080/app/`.

## Run As Desktop App (Windows)

Desktop host project:

- [desktop/HoursPilot.Desktop/HoursPilot.Desktop.csproj](desktop/HoursPilot.Desktop/HoursPilot.Desktop.csproj)

Build and run:

```powershell
cd C:/Users/dalli/source/repos/project_tracking/desktop/HoursPilot.Desktop
dotnet run
```

The desktop app uses WebView2 and loads the web app files bundled from [app/index.html](app/index.html).

## CSV Backend

Time entries are intended to live in a CSV file.

1. Open the app.
2. Go to Settings.
3. Choose Connect CSV File.
4. Select an existing CSV, such as [app/data/synthetic-two-weeks.csv](app/data/synthetic-two-weeks.csv), or another CSV using the same schema.

After connection, entry changes auto-sync back to that file.

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
