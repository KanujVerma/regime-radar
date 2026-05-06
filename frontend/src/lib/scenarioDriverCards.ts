// frontend/src/lib/scenarioDriverCards.ts
import type { DriverDelta } from '../types/api'
import type { ScenarioInputs, SliderConfig } from './sliderConfig'

export interface SelectedDriverCards {
  primary: DriverDelta | null
  secondary: DriverDelta | null
  offset: DriverDelta | null
}

export interface ChangedPill {
  key: string
  label: string
  delta: number
}

const ACTIVE_THRESHOLD = 0.03
const OFFSET_THRESHOLD = 0.01

/** Active when at least one driver has |delta_value| >= 0.03 */
export function isActiveDriverState(driverDeltas: DriverDelta[]): boolean {
  return driverDeltas.some(d => Math.abs(d.delta_value) >= ACTIVE_THRESHOLD)
}

/**
 * Selects up to 3 cards:
 *   primary  — largest |delta_value| overall, must be >= 0.03 or all return null
 *   secondary — same sign as primary, |delta_value| >= 0.03
 *   offset   — opposite sign to primary, |delta_value| >= 0.01
 *
 * Self-guarding: if no driver reaches the 0.03 active threshold, returns all nulls.
 * Callers do not need to check isActiveDriverState() before destructuring.
 */
export function selectDriverCards(driverDeltas: DriverDelta[]): SelectedDriverCards {
  if (!driverDeltas.length) return { primary: null, secondary: null, offset: null }

  const sorted = [...driverDeltas].sort(
    (a, b) => Math.abs(b.delta_value) - Math.abs(a.delta_value),
  )
  const primary = sorted[0]

  // If even the strongest driver doesn't reach the active threshold, show nothing.
  if (Math.abs(primary.delta_value) < ACTIVE_THRESHOLD) {
    return { primary: null, secondary: null, offset: null }
  }

  const primarySign = Math.sign(primary.delta_value)

  const secondary =
    sorted
      .slice(1)
      .find(
        d =>
          Math.sign(d.delta_value) === primarySign &&
          Math.abs(d.delta_value) >= ACTIVE_THRESHOLD,
      ) ?? null

  const offset =
    sorted
      .slice(1)
      .find(
        d =>
          Math.sign(d.delta_value) !== primarySign &&
          Math.abs(d.delta_value) >= OFFSET_THRESHOLD,
      ) ?? null

  return { primary, secondary, offset }
}

/**
 * Returns one entry per slider input that changed from baseline by > 0.001.
 * Uses SLIDER_CONFIG label strings for user-readable pill text.
 *
 * pill.delta is a signed change magnitude (positive = user moved value up).
 * The component should format it with formatDriverVal(key, Math.abs(delta)) because
 * change magnitude shares the same units as the absolute value for all current
 * driver fields. If that assumption changes, add a dedicated formatPillDelta helper.
 */
export function getChangedInputPills(
  inputs: ScenarioInputs,
  baselineInputs: Record<string, number>,
  sliderConfig: SliderConfig[],
): ChangedPill[] {
  return sliderConfig.flatMap(cfg => {
    const current  = inputs[cfg.key]         ?? 0
    const baseline = baselineInputs[cfg.key] ?? current  // missing key → treat as unchanged
    const delta    = current - baseline
    if (Math.abs(delta) <= 0.001) return []
    return [{ key: cfg.key, label: cfg.label, delta }]
  })
}
