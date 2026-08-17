# Panda Express #2355 — Schedule Optimization & Labor Forecasting

A single-file web app for restaurant shift scheduling, meal break compliance, and sales-driven labor forecasting. No build step, no server — just `index.html`.

## Features

- **Schedule tab** — coverage heat map in 30-minute slots from 7 AM to close+buffer, colored by staffing vs. sales demand. Colouring is **symmetric**: green = matches demand, yellow = 1 off, red = 2+ off *whether short or over-staffed*, since over-scheduling a slow hour costs as much as under-covering a busy one. Rush hours (lunch/dinner blackouts) are banded in orange.
  - **Directional arrows** on every off-target slot say what to do: <b>↑2</b> = add 2 staff (short), <b>↓1</b> = cut 1 (over-staffed). On-target slots show just the number.
  - **Per-day intensity bubbles** under each weekday header rank that day by its own total net sales (●●●●● = busiest day of the week, ● = slowest), scaled across the week's observed range so days with similar totals still separate visibly. Headcount targets are computed per day, so a busy Friday and a slow Monday get different recommendations at the same hour.
- **Meal Breaks tab** — pick a day to see the full break roster for that day, then assign each shift's break from one-click window buttons (starts snap to :00/:30 only — never 3:45). Per-shift timeline shows blackout zones (lunch 12–2, dinner 5–8 by default). Conflict report and manager override for no-window shifts.
- **Sales & Forecast tab** — baseline week charts (daily revenue, hourly distribution), forecast builder (growth % or absolute $, optional adjustment), recommended hourly staffing with gaps, risk levels, and revenue-at-risk estimates.
- **Coverage tab** — hour-block analysis (rushes, break windows, wind-down) plus a prioritized alert feed.
- **A/B Compare tab** — current vs. proposed labor hours, cost delta, ROI; "Apply proposed" injects Flex cover shifts with breaks auto-assigned.
- **Import/Export tab** — schedule import from `.xlsx`/`.csv` (template downloadable), sales import from "Sales & Labor By Time" PDFs or CSV, exports: payroll CSV, printable weekly schedule & conflicts report (print → save as PDF), config JSON import/export.
- **Settings tab** — all thresholds configurable: shift cutoffs, per-day store hours, break rules & blackout hours, special days, busyness multipliers, wage, staffing color bands.

Everything persists in your browser (localStorage). "Reset to sample data" restores the demo roster and sales week.

## Labor model (day-part export)

Import Panda's day-part "Export" sheet (30-min slots × 7 days, with Net Sales / Actual / Scheduled / Min / **Rcmd**) and every headcount target in the app switches from a rough heuristic to real data.

Two modes, switchable in the Sales & Forecast tab:

- **Smoothed by sales intensity** (default) — an isotonic regression is fitted to all (sales, Rcmd) pairs, producing a headcount curve that never decreases as sales rise. This is what resolves the day-part inconsistency where high-sales non-rush slots weren't classified yet.
- **Panda Rcmd (raw)** — uses the Rcmd value for each slot exactly as provided.

Panda's `Min` column is always respected as a floor. Slots where raw Rcmd disagrees with the curve by 2+ heads are listed as "unclassified high-intensity slots" so you can see exactly which ones need review.

## Import formats

**Schedule (.xlsx / .xls / .csv):** the layout is auto-detected — you don't need to reformat anything.

- Finds the header row containing Sun–Sat (any casing, and abbreviations like `Tues`/`Thur`).
- Finds the Name column by its header (`Name`, `Employee`, `Associate`, `Staff`); if there's no such header it picks the text column left of the day columns.
- **Filters out** index columns (`No`), blank spacer columns, date sub-header rows, and totals rows — the report after import lists exactly what was dropped.
- Shifts parse as `9-4`, `3:30-10:30`, `7:30-3`, `8:30-4:30`; AM/PM is inferred from store hours.
- `off` / `x` / `-` are blanks. `Meeting`, `Training`, `Vacation`, `PTO`, `Sick`, `Holiday` are recognised as non-shift entries and reported separately rather than counted as errors.
- **Multi-tab workbooks**: every weekly tab is detected and you pick which week to load; you can switch weeks later without re-importing.

**Sales CSV:** `date,time_block,revenue,guests` — e.g. `2026-07-19,11:00-11:30,245.67,23`. One file can hold multiple days.

**Sales PDF:** drop up to 7 "Sales & Labor By Time" report PDFs; date is read from the header, rows parsed per time block. If a PDF won't parse, use the CSV format.

## Meal break rules (defaults)

- Shifts > 6.0 h require a 30-minute meal break; shorter shifts get informal 10-minute breaks.
- **Fatigue rule:** the break may not start until the associate has worked at least **1 h**, and the scheduler aims for the **1–2 h band** so nobody breaks straight off the clock or runs the back half of a shift without rest. Breaks assigned earlier are flagged 🔴 critical.
- **5th-hour rule:** the break must be completed before the 5th hour of work (configurable in Settings). Assigned breaks that violate it are flagged 🔴 critical.
- **Structural bottlenecks:** when a start time is squeezed between the earliest-break rule, a rush blackout and the 5th-hour deadline, the Conflict Report names it and shows how many shifts compete for the single remaining slot.
- **Suggested Fixes (auto):** when breaks can't all be placed, the app simulates candidate remedies against the real rules and lists only the ones that genuinely free a break — nudging a shift ±30/60 min, shortening a shift below the break threshold, or trimming a rush blackout. Each is ranked by breaks gained then coverage impact, shows its predicted effect, and has a one-click **Apply**.
- **Stagger rule:** no two employees may be on meal break at the same time. Auto-assign solves this as a bipartite matching problem, so it finds the *maximum* number of placeable breaks rather than stranding someone greedily. Toggleable in Settings.
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
