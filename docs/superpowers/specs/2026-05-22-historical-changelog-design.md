# Historical Changelog Design Spec

_Date: 2026-05-22_

## Goal

Add a "Notable days" changelog section to the History page — one entry per trading day where something materially changed, computed on request from the existing daily state artifacts. Entries show what changed, why it mattered, and the backend-computed narrative. This is the interpreted layer on top of the raw daily artifacts.

## Decisions locked

| Decision | Choice |
|---|---|
| Entry type | Notable days only (not full log, not digest) |
| Location | New Panel on History page (below existing charts) |
| Entry format | Timeline row: date, trigger badges, inline summary, narrative sub-line |
| Computation | Backend endpoint, on request from `data/daily_state/*.json` |
| Narrative | Backend-computed, deterministic, template-keyed to `primary_trigger` |
| Header | Clean title only ("Notable days"), no metadata line |
| Error handling | Hook exposes `{ data, loading, error }`; page shows "Changelog unavailable" on failure |

---

## Architecture

### Backend

**New helper:** `_compute_changelog_entries(daily_state_dir, limit, since, notable_only) -> list[dict]`

In `src/api/routes.py` alongside `_compute_daily_diff`.

Logic:
1. Read and sort all `*.json` files in `daily_state_dir` ascending by filename (ISO dates sort correctly lexicographically)
2. Diff consecutive pairs (same pattern as `_compute_daily_diff`, generalized to N pairs)
3. For each pair, compute triggers, `primary_trigger`, `gap_days`, `is_stale_gap`, and `narrative`
4. If `notable_only=True`, keep only entries where `len(triggers) > 0`
5. Apply `since` filter: drop entries where `current_date <= since`
6. Return last `limit` entries, most-recent-first

Returns `[]` (not raises) when directory has < 2 files — no HTTP semantics in the helper.

**New endpoint:** `GET /changelog`

```
Query params:
  limit: int = 50
  since: str | None = None       # ISO date, e.g. "2026-05-01"
  notable_only: bool = True
```

Endpoint behavior:
- `daily_state_dir` missing OR < 2 files → **404** "not enough daily snapshots"
- ≥ 2 files, no notable entries → **200** with `entries: []` (valid, not an error)

**Materiality triggers** (any one fires → entry is notable):

| Trigger key | Condition |
|---|---|
| `regime_shift` | `current.regime != previous.regime` |
| `risk_move` | `abs(risk_delta) >= 0.05` |
| `vix_move` | `abs(vix_delta) >= 1.5` |
| `driver_rotation` | `top_driver_changed AND current_top_driver.importance >= DRIVER_ROTATION_MIN_IMPORTANCE` |

`DRIVER_ROTATION_MIN_IMPORTANCE = 0.15` — named constant at module level, easy to tune.

Priority (for `primary_trigger`): `regime_shift > risk_move > vix_move > driver_rotation`

**Narrative templates** (deterministic, keyed to `primary_trigger`):

| Primary trigger | Template |
|---|---|
| `regime_shift` | `"{prior_regime.title()} → {regime.title()}. Risk {risk_delta:+.0%} to {transition_risk:.0%}."` |
| `risk_move` | `"Transition risk {risk_delta:+.0%} to {transition_risk:.0%}. Regime: {regime.title()}."` |
| `vix_move` | `"VIX {'rose' if vix_delta > 0 else 'fell'} {abs(vix_delta):.1f} to {vix_level:.1f}. Risk {transition_risk:.0%}."` |
| `driver_rotation` | `"Top driver shifted to {current_top_driver.plain_label} (was: {prior_top_driver.plain_label})."` |

Note: percentages in narratives are displayed as pp-style integers (e.g. "+14pp to 80%"), so format `risk_delta` as `f"{risk_delta*100:+.0f}pp"` and `transition_risk` as `f"{transition_risk*100:.0f}%"`.

**Fallback narrative** (when `triggers` is empty, i.e. `notable_only=False` entries):
`"No notable market-state change from the prior snapshot."`

**Helper / endpoint boundary — explicit rule:**
`_compute_changelog_entries()` is a pure data function. It returns `[]` when `daily_state_dir` has < 2 files and never raises HTTP exceptions. The endpoint is the only place that converts a < 2 file condition to a **404**. This boundary must not be blurred: tests for the helper assert return values; tests for the endpoint assert HTTP status codes.

---

### Pydantic schemas (`src/api/schemas.py`)

```python
class ChangelogEntry(BaseModel):
    current_date: str
    previous_date: str | None
    gap_days: int
    is_stale_gap: bool              # gap_days > 5
    regime: str
    transition_risk: float
    risk_delta: float
    vix_level: float | None
    vix_delta: float | None
    trend: str
    prior_regime: str | None
    prior_trend: str | None
    top_driver: DailyDriverEntry | None      # includes importance field
    prior_top_driver: DailyDriverEntry | None
    triggers: list[str]
    primary_trigger: str | None     # None when triggers is empty (notable_only=False entries)
    narrative: str

class ChangelogResponse(BaseModel):
    entries: list[ChangelogEntry]    # most-recent-first
    total_notable: int
    total_days: int
    earliest_date: str | None
    latest_date: str | None
```

`DailyDriverEntry` (already in schemas.py) has `feature`, `plain_label`, `importance`. Used here instead of `DailyTopDriverRef` to carry importance through to the frontend and enable the driver-rotation gate.

---

### Frontend

**Types** (`frontend/src/types/api.ts` — append):

```typescript
export interface ChangelogEntry {
  current_date: string
  previous_date: string | null
  gap_days: number
  is_stale_gap: boolean
  regime: string
  transition_risk: number
  risk_delta: number
  vix_level: number | null
  vix_delta: number | null
  trend: string
  prior_regime: string | null
  prior_trend: string | null
  top_driver: DailyDriverEntry | null
  prior_top_driver: DailyDriverEntry | null
  triggers: string[]
  primary_trigger: string | null   // null when triggers is empty
  narrative: string
}

export interface ChangelogResponse {
  entries: ChangelogEntry[]
  total_notable: number
  total_days: number
  earliest_date: string | null
  latest_date: string | null
}
```

**API client** (`frontend/src/api/client.ts`):

```typescript
changelog: (params?: { limit?: number; since?: string; notable_only?: boolean }) => {
  const qs = params
    ? new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)])
      ).toString()
    : ''
  return get<ChangelogResponse>('/changelog' + (qs ? '?' + qs : ''))
}
```

Build the query string first; only append `?` if it is non-empty. This avoids producing `/changelog?` when params is provided but all values are undefined.

**Hook** (`frontend/src/hooks/useChangelog.ts` — new file):

```typescript
import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ChangelogResponse } from '../types/api'

export function useChangelog() {
  const [data, setData] = useState<ChangelogResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.changelog({ limit: 20 })
      .then(result => { setData(result); setError(null) })
      .catch(() => { setData(null); setError('Changelog unavailable right now.') })
      .finally(() => setLoading(false))
  }, [])
  return { data, loading, error }
}
```

**Component** (`frontend/src/components/ui/ChangelogFeed.tsx` — new file):

Regime color map:
```typescript
const REGIME_COLOR: Record<string, string> = {
  calm: '#22c55e',
  elevated: '#f59e0b',
  turbulent: '#ef4444',
}
```

Badge labels — static triggers use a label map; value-bearing triggers (`risk_move`, `vix_move`) are computed inline per entry during render:

```typescript
const STATIC_TRIGGER_LABEL: Record<string, string> = {
  regime_shift: 'REGIME SHIFT',
  driver_rotation: 'DRIVER SHIFT',
}
// risk_move badge: `RISK ${risk_delta > 0 ? '+' : ''}${Math.round(risk_delta * 100)}pp`
// vix_move badge:  `VIX ${vix_delta > 0 ? '+' : ''}${vix_delta?.toFixed(1)}`
```

Each entry row:
- Left border: 2px solid, color = `REGIME_COLOR[entry.regime]`
- Left column: date in `MMM DD` format (monospace, muted)
- Right column:
  - Row 1: trigger badges + concise inline summary / regime context (e.g. "Calm → Elevated" or "Regime: Elevated")
  - Row 2: `narrative` string in muted text
  - If `is_stale_gap`: append a `⚠ {gap_days}d gap` inline tag after badges

Empty state (entries.length === 0): `<p>No notable changes in the available data.</p>` in muted text.

**History page** (`frontend/src/pages/History.tsx`):

```typescript
const { data: changelog, loading: changelogLoading, error: changelogError } = useChangelog()
```

Third panel below the existing two:

```tsx
<Panel title="Notable days">
  {changelogLoading && <div className="text-slate-500 text-sm">Loading…</div>}
  {changelogError && <div className="text-slate-500 text-xs">{changelogError}</div>}
  {changelog && <ChangelogFeed data={changelog} />}
</Panel>
```

---

## Tests

### `tests/test_changelog.py` (new file)

Unit tests for `_compute_changelog_entries`:

| Test | Scenario |
|---|---|
| `test_empty_dir` | directory has 0 files → `[]` |
| `test_single_file` | directory has 1 file → `[]` |
| `test_notable_regime_shift` | two files with regime change → 1 entry, `primary_trigger = "regime_shift"` |
| `test_non_notable_small_deltas` | delta below all thresholds → 0 entries (`notable_only=True`); 1 entry (`notable_only=False`) with `primary_trigger=None` and fallback narrative |
| `test_risk_move_threshold_boundary` | `risk_delta = 0.049` → miss; `risk_delta = 0.050` → hit |
| `test_driver_rotation_importance_gate` | importance `0.14` → miss; `0.15` → hit |
| `test_since_filter` | two notable entries; `since` = date of first → only second returned |
| `test_limit` | 5 notable entries, `limit=3` → 3 entries, most-recent-first |
| `test_narrative_regime_shift` | narrative contains regime transition and risk delta |
| `test_narrative_risk_move` | narrative contains risk delta and regime |
| `test_narrative_vix_move` | narrative contains VIX level and direction |
| `test_narrative_driver_rotation` | narrative contains current and prior driver plain labels |
| `test_gap_days_and_stale_flag` | non-adjacent dates → correct `gap_days`; `gap_days > 5` → `is_stale_gap=True` |

### `tests/test_api_smoke.py` (add `TestChangelogEndpoint`):

- `test_changelog_200` — monkeypatches `_compute_changelog_entries` to return one entry; asserts 200 + `entries` key present
- `test_changelog_404_when_fewer_than_two_snapshots` — monkeypatches dir with 1 file; asserts 404

### Frontend component tests (conditional)

Check `frontend/package.json` for `vitest` or `@testing-library/react`. If present, add `tests/ChangelogFeed.test.tsx`:
- renders entry rows for a minimal `ChangelogResponse`
- shows the primary trigger badge
- shows the narrative sub-line
- shows `⚠ Xd gap` tag when `is_stale_gap=true`

If no frontend test infrastructure exists, skip.

---

## Files touched

| File | Action |
|---|---|
| `src/api/schemas.py` | Add `ChangelogEntry`, `ChangelogResponse` |
| `src/api/routes.py` | Add `DRIVER_ROTATION_MIN_IMPORTANCE`, `_compute_changelog_entries()`, `GET /changelog` |
| `frontend/src/types/api.ts` | Append `ChangelogEntry`, `ChangelogResponse` |
| `frontend/src/api/client.ts` | Add `changelog()` method |
| `frontend/src/hooks/useChangelog.ts` | New file |
| `frontend/src/components/ui/ChangelogFeed.tsx` | New file |
| `frontend/src/pages/History.tsx` | Add third Panel with `<ChangelogFeed />` |
| `tests/test_changelog.py` | New file |
| `tests/test_api_smoke.py` | Add `TestChangelogEndpoint` |

---

## Verification

1. `pytest tests/test_changelog.py -v` — all 13 unit tests pass
2. `pytest tests/test_api_smoke.py::TestChangelogEndpoint -v` — both smoke tests pass
3. `pytest` — full suite green
4. `uvicorn src.api.main:app --reload` → `GET /changelog` returns well-formed JSON with entries; `GET /changelog?notable_only=false` returns all days
5. `cd frontend && npm run dev` → History page shows Notable days panel; entries render with correct left-border colors and narrative sub-lines; stale-gap tag visible when applicable; "Changelog unavailable" shown if backend returns error
6. `npm run build` — clean TypeScript build

## Out of scope (later)

- `/changelog` as a dedicated page
- Recent-context preview panel on Current State
- RSS/Atom feed from changelog entries (next sub-project)
- Filtering UI in the History page section
- Month/year grouping headers as entry count grows
