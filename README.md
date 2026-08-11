# Panda Express #2355 — Schedule Optimization & Labor Forecasting

A single-file web app for restaurant shift scheduling, meal break compliance, and sales-driven labor forecasting. No build step, no server — just `index.html`.

## Features

- **Schedule tab** — coverage heat map in 30-minute slots from 7 AM to close+buffer, colored by staffing vs. sales demand for that slot (red = 2+ short, yellow = 1 short, green = meets demand, blue = over-staffed; hover any cell to see staff/demand). Staffing summary cards, editable employee schedule table. Click any shift to edit; "+ Add shift" for new ones.
- **Meal Breaks tab** — pick a day to see the full break roster for that day, then assign each shift's break from one-click window buttons (starts snap to :00/:30 only — never 3:45). Per-shift timeline shows blackout zones (lunch 12–2, dinner 5–8 by default). Conflict report and manager override for no-window shifts.
- **Sales & Forecast tab** — baseline week charts (daily revenue, hourly distribution), forecast builder (growth % or absolute $, optional adjustment), recommended hourly staffing with gaps, risk levels, and revenue-at-risk estimates.
- **Coverage tab** — hour-block analysis (rushes, break windows, wind-down) plus a prioritized alert feed.
- **A/B Compare tab** — current vs. proposed labor hours, cost delta, ROI; "Apply proposed" injects Flex cover shifts with breaks auto-assigned.
- **Import/Export tab** — schedule import from `.xlsx`/`.csv` (template downloadable), sales import from "Sales & Labor By Time" PDFs or CSV, exports: payroll CSV, printable weekly schedule & conflicts report (print → save as PDF), config JSON import/export.
- **Settings tab** — all thresholds configurable: shift cutoffs, per-day store hours, break rules & blackout hours, special days, busyness multipliers, wage, staffing color bands.

Everything persists in your browser (localStorage). "Reset to sample data" restores the demo roster and sales week.

## Labor Model (Day-part export)

Import Panda's day-part "Export" sheet (30-min slots × 7 days, with Net Sales / Actual / Scheduled / Min / Rcmd) and every headcount target in the app switches from a rough heuristic to real data.

Two modes, switchable in the Sales & Forecast tab:
- **Smoothed by sales intensity** (default): an isotonic regression is fitted to all (sales, Rcmd) pairs, producing a headcount curve that never decreases as sales rise. This is what resolves the day-part inconsistency where high-sales non-rush slots weren't classified yet.
- **Panda Rcmd** (raw): uses the Rcmd value for each slot exactly as provided.

## Import formats

**Schedule (.xlsx / .csv):** first column employee name, then Sun–Sat columns with shifts like `9-4`, `3:30-10:30`, `7:30-3`, or `off`. AM/PM is inferred from store hours. Unparseable cells are skipped and reported.

**Sales CSV:** `date,time_block,revenue,guests` — e.g. `2026-07-19,11:00-11:30,245.67,23`. One file can hold multiple days.

**Sales PDF:** drop up to 7 "Sales & Labor By Time" report PDFs; date is read from the header, rows parsed per time block. If a PDF won't parse, use the CSV format.

## Meal break rules (defaults)

- Shifts > 6.0 h require a 30-minute meal break; shorter shifts get informal 10-minute breaks.
- Breaks cannot overlap blackout windows (lunch/dinner rush) and must fit entirely inside the shift.
- Break starts snap to the clock (:00 or :30, on-the-hour preferred). Preferred placement: mid-shift, not the first or last hour, biased post-rush.

## Store hours & closing crew

Store closes 10:00 PM weekdays, 10:30 PM Fri/Sat/Sun (all editable). The **closing buffer** (default 30 min) schedules the closing crew past close — e.g. 10:30 close → scheduled to 11:00 PM, actual leave 11–11:30. The heat map shows those slots as "closing crew" (blue tint).
- Shifts with no valid window are flagged 🔴 critical; resolve by extending/splitting the shift or logging a manager override.

All of the above is editable in Settings — changes re-validate every assigned break.

## Mobile

Fully responsive: swipeable tab bar, wide tables scroll horizontally with the time/name column pinned, larger touch targets, and single-column layouts on phones. Tip: on iPhone/Android, open the site and "Add to Home Screen" for an app-like experience.

## Tech

Vanilla JS + CSS in one HTML file. CDN libraries: Chart.js (charts), SheetJS (Excel), pdf.js (PDF parsing). Works offline except for those three CDN loads and PDF parsing.
