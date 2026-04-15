# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CrossStitch is a Telegram Mini App for tracking cross-stitch embroidery projects. The UI language is Russian. There is no build system — the frontend is a single self-contained HTML file with embedded CSS and JavaScript.

## Architecture

```
index.html (frontend)  →  Code.gs (Google Apps Script backend)  →  Google Sheets (database)
     ↓
Telegram Mini App SDK
```

**Two files contain all application logic:**
- `index.html` — complete single-page app: HTML structure, embedded CSS, embedded vanilla JavaScript (~1500 lines)
- `Code.gs` — Google Apps Script backend deployed as a web app; handles all data read/write to Google Sheets and Telegram bot webhook

## Development Workflow

**Frontend:** Edit `index.html` directly. No build step. Test by opening in a browser (mock `window.Telegram.WebApp` if needed, or test via Telegram with the deployed GAS URL).

**Backend:** Edit `Code.gs` and redeploy to Google Apps Script. After deployment, update `GAS_URL` in `index.html` with the new deployment URL (it changes on each new deployment).

**Deploy frontend:** Push to `main` branch — Netlify auto-deploys `index.html` at https://stitch-count.netlify.app/. The GitHub repo is private; Netlify is connected via OAuth and has access. No build command or publish directory needed (static file). Update the Telegram Mini App URL in BotFather if the Netlify domain changes.

## Backend API (Code.gs)

**Important:** Mini App requests use **GET** (via `doGet`). Only Telegram bot webhooks use **POST** (via `doPost`).

All Mini App requests go to `GAS_URL` as GET with URL query params containing an `action` field (via `apiGet()` in frontend):

| action | description |
|---|---|
| `getProjects` | Active + inactive projects with today's stitch counts; also returns `startedCount`/`finishedCount` from Статистика sheet |
| `logStitches` | Log stitches for a project (params: `project`, `count`) |
| `getWeeklyStats` | Weekly stats with per-day breakdown and per-project norms |
| `getYearlyStats` | Yearly stats by month + streaks, median, daysNoStitch from Статистика sheet |
| `addProject` | Create new project (params: `name`, `designer`, `totalStitches`, `finishDate`) |
| `updateProject` | Edit existing project (params: `originalName`, `name`, `designer`, `totalStitches`, `finishDate`) |
| `editLogEntry` | Modify a past log entry (params: `date`, `project`, `count`) |
| `getRecentLog` | Recent log entries for the current week |
| `finishProject` | Mark project as 100% done — logs remaining stitches, sets finish date to today |

The same GAS endpoint handles Telegram bot webhooks via `doPost` (commands: `📊 ИТОГИ`, `📅 ПЛАН`, `🎡 ФОРТУНА`, or a number to log stitches).

## Google Sheets Schema

- Sheet **"Крестики"**: Log entries — columns: A: Date (dd.MM.yyyy), B: Project name, C: Stitch count
- Sheet **"Проекты"**: Projects — B: Name, C: Designer, E: Start date, F: Finish date, H: Total stitches, I: Progress stitches done, J: Remaining stitches, K: Progress ratio (0–1), O: Weekly norm, P: Left this week (all calculated by sheet formulas)
- Sheet **"Статистика"**: Computed stats — F18: started projects count, F19: finished projects count, K4: days without stitching, K7: current streak, K10: max streak, K13: projected finish year, I10: median stitches per active day

**Active vs inactive projects:**
- **Active**: has finish date set AND progress < 100% — shown in Вышиваем, tracked for weekly norm
- **Inactive**: no finish date (paused/on hold) — shown in Вышиваем and Проекты with `inactive: true` flag, no weekly norm

## Configuration (Code.gs)

```javascript
const TOKEN = "...";    // Telegram Bot API token
const SHEET_ID = "..."; // Google Sheet ID
const TZ = "GMT+1";     // Timezone for date formatting
```

After deploying a new GAS version, update `GAS_URL` constant in `index.html`.

## Frontend Structure (index.html)

**Four tabs (pages):**
1. **Вышиваем** (`today`) — Log daily stitches; select project card, tap +/−, save
2. **Неделя** (`week`) — Weekly stats: bar chart per project + day-of-week histogram
3. **Год** (`year`) — Yearly stats by month + stat cards (streak, median, etc.)
4. **Проекты** (`manage`) — Project list with started/finished counts; add/edit/finish modal

**Key JS functions:**
- `init()` — startup: calls `loadProjects()`, `setHeaderDate()`, `loadDaysNoStitch()`
- `apiGet(params)` — GET request to GAS_URL with URL params, returns parsed JSON
- `loadProjects()` — fetches getProjects, renders Вышиваем and Проекты tabs
- `loadWeeklyStats()` — fetches getWeeklyStats, renders Неделя tab
- `loadYearlyStats()` — fetches getYearlyStats, renders Год tab
- `renderTodayProjects()` — renders project cards in Вышиваем tab
- `renderWeeklyStats(data)` — renders weekly bar chart and day histogram
- `renderYearlyStats(data)` — renders monthly bar chart and stat cards
- `renderManageProjects()` — renders project list in Проекты tab
- `selectProject(name)` — set active project, show stitch input
- `clearSelected()` — deselect project, restore scroll
- `changeCount(delta)` — increment/decrement stitch counter
- `saveStitches()` — GET logStitches to GAS, updates local state
- `switchPage(name)` — tab navigation, lazy-loads tab data
- `showFortune()` — random project picker modal
- `selectFortuneProject()` — select fortune result, switch to Вышиваем
- `openProjectForm(projectName?)` — open add/edit modal (edit if name passed)
- `submitProjectForm()` — GET addProject or updateProject to GAS
- `finishProject(name)` — confirm dialog → GET finishProject to GAS
- `showToast(msg)` — brief notification overlay
- `updateProjectCounts(data)` — updates started/finished count display in Проекты tab

All API calls use GET: `fetch(GAS_URL + '?' + new URLSearchParams(params))`.
