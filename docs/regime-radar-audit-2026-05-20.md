# RegimeRadar — End-to-End Product / Technical / Utility Audit
_Date: 2026-05-20 · Method: full code read (3 parallel deep-dives), live API probing, live Playwright walkthrough (desktop + mobile), git history review._

---

## Context

This is an audit, not a feature build. Goal: say plainly what RegimeRadar is, what's strong, what's weak or misleading, what real users would actually return for, and what to do next if the goal is genuine utility rather than resume polish. Conclusions below are anchored to specific files and to the **live** production state on 2026-05-20.

The single most important live finding sets the tone: the production homepage right now shows **"TRANSITION RISK 81.3% — chance conditions worsen this week"** sitting directly next to **VIX 18.1, trend up, 99% "elevated" / 0.02% "turbulent", "VIX stable"**, with the "key risk drivers" panel **empty**. The front door contradicts itself. That is the gap between "impressive demo" and "tool people trust."

---

# 0. Executive summary

RegimeRadar is a genuinely well-engineered, honestly-documented **portfolio ML project**: a daily SPY/VIX/EMV → 22-feature → two-XGBoost-model pipeline with walk-forward CV, calibration, and a clean React dashboard. As a **portfolio artifact for recruiters/engineers it is strong and already doing its job.** As a **product with recurring utility it is not there** — and a few live issues are actively eroding the credibility it would need to get there.

- **What it really is today:** a research/education demo + portfolio piece. Not a monitoring tool (no alerts, no accounts, no retention loop), not a signal tool (PR-AUC ~0.20, single asset, daily, model frozen since 2026-04-24).
- **Biggest problem:** trust. The headline number is currently out-of-calibration-range and self-contradictory, the marquee "drivers" panel is empty in production, and there is **no reason to come back tomorrow.**
- **Highest-leverage moves (all free):** (1) make the headline honest + coherent and restore live drivers; (2) add a retention loop — "what changed since yesterday" + RSS/email on regime change; (3) add CI + a monthly retrain so the model isn't silently drifting and the existing ~149 tests actually gate.

---

# 1. Product summary

- **What it is:** A live-ish market-state monitor. Two models in sequence: a 3-class regime classifier (Calm/Elevated/Turbulent) and a binary 5-day transition-risk model (will conditions worsen within 5 trading days). Served by FastAPI on Render free tier, React/TS dashboard on Vercel.
- **Problem it's trying to solve:** "Is the US large-cap equity market currently calm or stressed, and is stress likely to escalate soon?" — packaged with honest evaluation instead of black-box sentiment.
- **Who it's for (as built):** primarily **technical reviewers** (recruiters, engineers, ML/quant readers). Secondarily finance-curious people who enjoy the narrative explanations. It is *not* built for someone making trading decisions.
- **What decisions a user could actually make from it:** honestly, very few today. There's no actionable threshold tied to a documented hit-rate, no alerting, no position guidance, single asset. The realistic "decision" is *attention allocation* ("should I pay more attention to the market this week?") — and even that is undermined by the current incoherent headline.
- **What category it's in:** **portfolio artifact + educational/research demo.** It is dressed as a monitoring dashboard but lacks every property (reliability, alerts, retention, freshness guarantees) that makes a monitoring dashboard useful.

---

# 2. Repo / system index

**Backend (`src/`)**
- `src/api/main.py` — FastAPI app; `@on_event("startup")` runs a synchronous live refresh, falls back to committed snapshots on *any* exception (demo mode). CORS `allow_origins=["*"]`.
- `src/api/routes.py` — all endpoints (see §below).
- `src/api/state.py` — SQLite app state (`data/app.db`, append-only `live_state` table), APScheduler 5-min weekday refresh, snapshot sync, 12h cache TTL.
- `src/data/` — `fetch_*.py` (yfinance SPY, FRED VIXCLS, FRED EMVOVERALLEMV), `merge_sources.py`. VIX has FRED→yfinance→CSV fallback; **EMV is FRED-only in production** (`fetch_emv` `fallback_path` exists but isn't passed at `state.py:184`).
- `src/features/build_market_features.py` — the 22 features. Regime-memory features correctly `.shift(1)` (no leakage). `min_periods=1` on rolling normalizers contaminates earliest history.
- `src/labeling/` — rule-based regime + trend labels (deterministic).
- `src/models/predict_live.py` — live scoring. `transition_risk` = calibrated transition-model P(worsen in 5d) (`:46-58`). Regime label uses raw-prob `argmax` while `regime_history` returns the **smoothed** series → the two disagree by design (`:52-63`).
- `src/models/train_*.py`, `registry.py`, `src/evaluation/` — training, walk-forward CV (104 folds), isotonic/Platt calibration, baselines (`baseline.py`, coded but never run/persisted).

**API surface (`routes.py`)**
| Route | Returns | Note |
|---|---|---|
| `GET/HEAD /health` | status, mode, last_refresh, model_versions | fine |
| `POST /refresh-data` | forces live refresh | **unauthenticated** |
| `GET /current-state` | latest row + delta vs prior row | delta is 5-min, not daily |
| `GET /historical-state` | full-history rescored | **rebuilds features + rescores entire history every call, no cache** |
| `GET /transition-risk` | subset of historical-state | doubles cost |
| `GET /event-replay/{name}` | 3 hard-coded windows | 2008 / COVID / 2022 |
| `GET /model-drivers` | global_importance, local_explanation, threshold_sweep | works live |
| `POST /scenario` | re-derives baseline each call | zero-vector fallback returns a meaningless number |

**Frontend (`frontend/src/`)**
- `pages/CurrentState.tsx` — hero metrics, narrative (`lib/narratives.ts`), 3 regime-prob badges, SVG `GaugeArc`, top drivers, 30-day mini chart (slices last 30 from a 2020→now query — downloads ~6yr to draw 30 points).
- `pages/History.tsx` — SPY regime-band chart + optional VIX overlay + daily risk line. No callouts.
- `pages/EventReplay.tsx` — 3 hard-coded events; metrics computed client-side at `DEFAULT_THRESHOLD = 0.10`; static prose takeaway.
- `pages/ModelDrivers.tsx` (titled "Signal Breakdown", route `/model-drivers`) — narrative brief, push/pull, global-importance bars, **templated** "what would raise risk further" block, collapsible reliability/threshold table.
- `pages/ScenarioExplorer.tsx` — 6 presets, 6 sliders, threshold slider, verdict, `ProbabilityTripod`, driver cards + offset, changed-input pills. The strongest page.
- `api/client.ts` — typed client; `BASE_URL` from `VITE_API_URL` else `http://localhost:8000`.
- `hooks/` — `useCurrentState` (fetched twice per load — Sidebar + page, no shared cache), `useHealthStatus` (60s poll, 5s retry, 8s abort), `useScenario` (120ms debounce).
- Dead code: `RiskRail.tsx` imported nowhere. No Finnhub/live-price-card code despite README.

**Data flow:** yfinance + FRED → `merge_sources` → `build_market_features` → `predict_live` (regime + transition + calibrator) → SQLite row → `/current-state` → React. Nightly GitHub Action (`.github/workflows/update-snapshots.yml`, 22:00 UTC weekdays) refreshes committed `data/snapshots/*.parquet`. Models in `data/models/` are **committed and frozen at 2026-04-24**.

---

# 3. What it does well (specific, no fluff)

- **Honest methodology, and honest in code.** Walk-forward CV (104 folds, no look-ahead), explicit calibration (ECE 0.136→0.006, Brier 0.125→0.079), and the regime model is literally tagged in code as "reference/feature-sufficiency — not the primary ML contribution" (`train_regime_model.py:6`). Reported ROC-AUC 0.658 is modest and *not* oversold in the docs. This is rarer than it sounds and is the project's real backbone.
- **No feature leakage where it matters.** Regime-memory features are correctly `.shift(1)` (`build_market_features.py:69`). The transition target is well-defined.
- **Scenario Explorer is a genuinely good interactive.** Presets + sliders + verdict + baseline-vs-scenario tripod + "crises caught / false alarm" tradeoff give a real feel for model sensitivity. It's the one page with a working "do something → learn something" loop.
- **Narrative layer on Current State / Signal Breakdown.** Plain-English generation (`lib/narratives.ts`) is well above typical dashboard chrome — when the underlying numbers are coherent.
- **Operational resilience engineering for a free tier.** Cold-start abort (8s), health retry, snapshot fallback, demo badge, stale-snapshot fallback on FRED 500 (commit `417224d`), HEAD `/health` for UptimeRobot. Someone clearly fought the free-tier dragon and won.
- **Disciplined process.** Spec → plan → implement → polish, visible in `docs/superpowers/`. Clean commit hygiene. ~149 real tests exist locally.
- **Runtime is clean.** Live walkthrough: zero console errors, zero failed/4xx requests across all five pages.

---

# 4. What it does poorly (sharp)

1. **The live headline is out-of-calibration-range and self-contradictory.** Production right now: `transition_risk=0.8133` shown as "81.3% chance conditions worsen this week," beside VIX 18, trend up, `prob_turbulent=0.0002`, `prob_elevated=0.9914`. The README's own OOF threshold sweep tops out at **0.30** (recall 0.7%) — meaning almost no out-of-fold prediction ever exceeded 0.30. A live **0.81** is essentially off the chart the model was calibrated/evaluated on. Either the frozen model is drifting/extrapolating on 2026 data, or "elevated regime" mechanically inflates elevated→turbulent risk. Either way the user sees a number that contradicts every other number on the page. **This is the credibility killer.**
2. **The marquee explainability panel is empty in production.** `/current-state` returns `top_drivers: []`. The homepage then silently falls back to *global* feature importance and presents it as "what is pushing risk right now" (`CurrentState.tsx:37-39`). The single most-screenshotted feature (SHAP drivers) shows nothing live.
3. **"Delta / since last refresh" is a 5-minute delta, not a daily one.** `read_prior_state` returns the previous SQLite row (`state.py`), and the scheduler writes every 5 minutes. So "since last refresh" almost always reads "no meaningful change" — the one thing a returning user wants ("what changed since yesterday") doesn't exist.
4. **Mobile is broken.** Fixed `marginLeft: 196` sidebar (`AppShell.tsx`) and fixed grid columns; on a 390px viewport the sidebar fills the screen and the content is clipped off the right edge (metric cards render as "MAR REGI / TRA RISK / VIX LEVE"). Unusable below ~1100px. The only media query in the codebase is `prefers-reduced-motion`.
5. **`/historical-state` rebuilds features and rescores the entire history on every request, uncached.** On Render free tier this is the obvious fragility/DOS vector and a cold-start amplifier. `/transition-risk` then does it again.
6. **Event Replay looks rigorous but is mostly static.** 3 hard-coded events, static prose takeaways, and metrics computed at a 10% threshold so nearly every event looks "caught" (37 alert days for 2008). It reads as analysis; it's a fixed exhibit.
7. **Several "insight" blocks are hard-coded templates, not model output.** "What would raise risk further" (`ModelDrivers.tsx:20-57`) and the Scenario driver-interpretation map (`ScenarioExplorer.tsx:34-67`) are prose templates; out-of-set features fall through to "interpretation unavailable."
8. **No retraining cadence.** Snapshots refresh nightly but models are frozen at 2026-04-24. There is no CI retrain, no drift check, no model-quality regression gate. Finding #1 is the visible symptom.
9. **Open `POST /refresh-data` + `CORS *` + no auth anywhere.** Anyone can trigger a yfinance/FRED fetch storm.
10. **Doc/UI drift.** README touts a Finnhub "live price-card overlay" that **does not exist** in the frontend; "5 trading days" in docs vs "this week" in UI; route is `/model-drivers` while the title says "Signal Breakdown"; "66 smoke tests" actually means the whole backend pytest suite (only 22 are API smoke tests).

---

# 5. Fake-useful vs actually useful

**Actually useful right now**
- Scenario Explorer (intuition sandbox; real verdict + tradeoff stats).
- Current State narrative + regime probabilities — *when coherent* (today they aren't).
- Signal Breakdown's calibration/threshold honesty table (educational, real).

**Interesting but mostly demo/showcase**
- Event Replay (3 static events, static prose, 10% threshold flatters every event).
- History (handsome charts, no annotations, nothing to act on).

**Technically cool, low practical value**
- `GaugeArc` SVG semicircle (re-encodes one number already shown larger directly above it).
- `ProbabilityTripod` width-shimmer + card stagger entrance (adds perceived latency, not understanding).

**Should be cut or deprioritized**
- Templated "what would raise risk further" bullets and the hard-coded driver-interpretation map — either derive them from the model or drop them; right now they masquerade as model insight.

**What a real user would return for vs what just looks sophisticated:** there is currently **nothing** with a built-in reason to return (no alert, no daily diff, no saved state). The sophistication (calibration, walk-forward, SHAP plumbing) mostly serves the *reviewer* audience, not a returning *user*.

---

# 6. Real-user utility analysis

| User | Likes | Ignores | Adoption blocker | Returns? |
|---|---|---|---|---|
| **Discretionary / swing trader** | Scenario sandbox | History, Event Replay | Daily-only, single asset, no alerts, headline they can't trust | **No** |
| **Macro / market observer** | Regime label, VIX overlay | Gauges, tripod | No "what changed," no notifications | Rarely |
| **Wants a market dashboard** | Clean look | Most numbers | No alerts/customization, broken mobile | No |
| **PM / analyst** | Methodology honesty | Single-asset signal | Too narrow, no breadth, no export | No |
| **Finance-curious general user** | Narratives, presets | Calibration table | Headline contradiction confuses | One visit |
| **Recruiter / eng reviewer** | Whole repo, pipeline, tests | n/a | None — but #1/#2/#4 are visible blemishes on the demo | **Yes (its real audience)** |
| **ML / quant person** | Walk-forward, calibration, SHAP | Aesthetic flourishes | PR-AUC 0.20, frozen model, 0.81 OOD reading | Skims once, respects it |

**Bottom line:** the only audience that returns is the reviewer — and the live homepage is the first thing they see.

---

# 7. Best free features to add (ranked)

Ranked by (user value × credibility) ÷ (effort), constrained to free/cheap. Items 1–2 are fixes but rank above features because they unblock everything.

1. **Make the headline honest + coherent; restore live drivers.** Reconcile `transition_risk` with the regime probabilities, frame it against base rate / historical percentile ("81% — higher than 97% of the last 2 years" or "rare: above the model's evaluated range — treat with caution"), and flag out-of-range readings instead of stating them flatly. Fix `top_drivers` (compute SHAP live or reuse `model-drivers` `local_explanation`). _Value: very high · Effort: low-med · Free._
2. **"What changed since yesterday."** Replace the 5-minute delta with a true daily diff using the nightly committed snapshots (regime change, risk move, top mover). _Value: high · Effort: low · Free._ This is the seed of every retention loop.
3. **RSS/Atom feed + optional email on regime change or risk-threshold crossing.** RSS is 100% free, no DB, no accounts — generate it in the nightly GitHub Action. This is the single biggest retention lever the project can get for free. _Value: high · Effort: med · Free._
4. **CI that runs the existing ~149 tests on push.** Pure credibility for the reviewer audience; catches the TS-build breakages that currently only Vercel catches. _Value: med-high (for the actual audience) · Effort: low · Free._
5. **Precompute `/historical-state` + `/model-drivers` into the nightly snapshot; serve static.** Kills the per-request full rescore, removes the DOS/cold-start vector. _Value: med · Effort: med · Free._
6. **Monthly retrain in CI committing fresh artifacts + a drift/eval check.** Directly fixes the frozen-model root cause behind #1. _Value: high · Effort: med · Free (GH Actions)._
7. **Regime calendar heatmap (year-in-pixels) + "compare to a past date".** Cheap, genuinely scannable, gives History a reason to exist. _Value: med · Effort: low-med · Free._
8. **Lock down `/refresh-data` (token or remove) and scope CORS.** _Value: low (security hygiene) · Effort: trivial · Free._

Deliberately **not** recommending: more presets, more animations, more event-replay events, more narrative copy. Those add polish, not utility.

---

# 8. What it would take to be a real tool

**Minimum viable real tool** (free-tier achievable)
- Coherent, honest, in-range headline (#1).
- A reason to return: "what changed since yesterday" (#2) + one push channel — RSS/email on regime change (#3).
- Reliability: precomputed responses, no per-request rescore (#5); CI gating (#4); monthly retrain + drift check (#6).
- Single asset is fine at this tier. This turns it from "demo" into "a thing one person checks weekly."

**Strong niche product**
- Multi-asset (bonds, gold, sectors/international) so the regime call has context.
- Customizable alerts + lightweight accounts/watchlists (still cheap: a free Postgres/Upstash tier).
- Actionable thresholds documented with realized hit-rate; historical-compare; working mobile.

**Serious commercial product**
- Data redundancy (no single FRED/yfinance point of failure), SLAs, intraday, model monitoring/eval harness in prod, auth/billing, support. _Not worth pursuing now._

"Real utility" here means: a returning user can answer, in under 10 seconds, *"did the market's state change, do I need to care this week, and can I trust why?"* — and gets told without having to open the site.

---

# 9. Recommended roadmap

## Immediate (next 1–2 weeks — highest ROI)
1. Fix headline coherence + calibration framing; flag out-of-range readings (#1a).
2. Fix empty `top_drivers` on Current State (#1b).
3. Real daily delta + "what changed since yesterday" strip (#2).
4. Add CI running the existing tests on push (#4).
5. Precompute `/historical-state` & `/model-drivers` into the nightly snapshot (#5).
6. Lock down `/refresh-data` (#8).

## Near-term
1. RSS/Atom feed + optional email on regime change / threshold cross (#3).
2. Monthly retrain in CI + drift/eval gate (#6).
3. Mobile layout (collapsible sidebar, responsive grids) (#4 in §4).
4. Regime calendar heatmap + compare-to-past-date (#7).
5. Replace templated forward-bullets / driver-interp with model-derived output, or cut them.

## Later / only if it gains traction
- Multi-asset; accounts/watchlists; intraday; product analytics/instrumentation; commercial infra. Don't build these on spec.

---

# 10. Final blunt assessment

- **What it is, really:** a top-decile *portfolio* ML project — end-to-end, honestly evaluated, cleanly presented — currently wearing the costume of a monitoring product it isn't. The engineering and methodology discipline are real and reviewer-impressive.
- **How close to "people would actually use it":** as a recurring tool, **not close** — there's no retention loop and the live headline isn't trustworthy. As a credible portfolio piece, **it's already there** (with two visible blemishes to fix).
- **Biggest gap between current state and real value:** **trust + return reason.** The front-page number contradicts itself and is outside the model's evaluated range, the drivers panel is empty, and nothing gives a user a reason to come back tomorrow.
- **If you only do 3 things:**
  1. **Make the headline honest and coherent** — reconcile transition risk with regime probabilities, frame against base rate/percentile, flag out-of-range readings, and restore live SHAP drivers.
  2. **Add a free retention loop** — true "what changed since yesterday" + RSS/email on regime change.
  3. **Add CI + monthly retraining/drift check** — so the model stops silently drifting and the ~149 existing tests actually gate every push.

Do those three and it stops being "an impressive demo" and becomes "a small tool a few people genuinely check" — without spending a dollar.

---

## Appendix — Top 10 recommendations ranked by impact
1. Fix live headline coherence + calibration framing (out-of-range flagging).
2. Restore live `top_drivers` on Current State.
3. "What changed since yesterday" daily diff (replace 5-min delta).
4. RSS/email alert on regime change / risk threshold.
5. Monthly retrain + drift/eval gate in CI.
6. CI running existing ~149 tests on push.
7. Precompute historical-state/model-drivers; remove per-request rescore.
8. Mobile responsive layout.
9. Regime calendar heatmap + compare-to-past.
10. Cut/replace templated "insight" blocks; lock down `/refresh-data` + CORS.

## Appendix — Do this / Don't do this
**Do**
- Fix the headline before anything else — it's the first thing every reviewer and user sees.
- Lean into the free retention loop (RSS/email + daily diff); it's the only path to "recurring."
- Add CI + retraining; it's cheap credibility and fixes the drift root cause.
- Keep and extend Scenario Explorer; it's the best thing here.
- Fix the README↔UI drift (Finnhub, "5 days" vs "this week", route/title, test count).

**Don't**
- Don't add more presets, events, animations, or narrative copy — that's polishing a demo.
- Don't build multi-asset, accounts, or intraday on spec before there's a single returning user.
- Don't keep templated text masquerading as model insight — derive it or delete it.
- Don't keep scoring full history per request or retrain manually-only.
- Don't market it as a monitoring/decision tool until the headline is trustworthy and there's an alert.
