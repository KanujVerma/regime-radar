import { describe, test, expect } from 'vitest'
import { riskReadingView } from './riskReading'
import type { RiskReading } from '../types/api'

const base: Omit<RiskReading, 'display_state'> = {
  validated_probability: null, stress_percentile: null, stress_tier: null,
  analog_status: 'not_applicable', nearest_analogs: null,
  support: { in_support: true, nn_z_distance: 1.0 }, max_evaluated_p: 0.30,
}

function noPercent(v: { lines: string[]; value: string | null }) {
  const all = [v.value ?? '', ...v.lines].join(' ')
  expect(all).not.toMatch(/\d%/)
}

test('validated: showsPercent true, value is a percent', () => {
  const v = riskReadingView({ ...base, display_state: 'validated', validated_probability: 0.18 })
  expect(v.kind).toBe('validated')
  expect(v.showsPercent).toBe(true)
  expect(v.value).toMatch(/18%/)
})

test('stress_in_support with analogs: tier + analog line, NO percent', () => {
  const v = riskReadingView({
    ...base, display_state: 'stress_in_support', stress_percentile: 0.98, stress_tier: 'Extreme',
    analog_status: 'available', nearest_analogs: [{ label: 'Mar 2020', date: '2020-03-16', raw_score: 0.97 }],
  })
  expect(v.kind).toBe('stress_in_support')
  expect(v.showsPercent).toBe(false)
  expect(v.tier).toBe('Extreme')
  expect(v.lines.join(' ')).toMatch(/Mar 2020/)
  expect(v.lines.join(' ')).toMatch(/ranks severity, not odds/)
  noPercent(v)
})

test('stress_in_support unavailable analogs: no analog line, still no percent', () => {
  const v = riskReadingView({
    ...base, display_state: 'stress_in_support', stress_percentile: 0.9, stress_tier: 'Elevated',
    analog_status: 'unavailable', nearest_analogs: null,
  })
  expect(v.tier).toBe('Elevated')
  expect(v.lines.join(' ')).not.toMatch(/last seen in/)
  noPercent(v)
})

test('stress_out_of_support: no-analog headline, NO percent, severity != trust', () => {
  const v = riskReadingView({
    ...base, display_state: 'stress_out_of_support', stress_percentile: 0.99, stress_tier: 'High',
    support: { in_support: false, nn_z_distance: 14.2 },
  })
  expect(v.kind).toBe('stress_out_of_support')
  expect(v.showsPercent).toBe(false)
  expect(v.lines.join(' ')).toMatch(/no historical analog/i)
  expect(v.lines.join(' ')).toMatch(/14\.2σ/)
  noPercent(v)
})

test('out-of-support with LOW percentile still renders out-of-support (4th cell)', () => {
  const v = riskReadingView({
    ...base, display_state: 'stress_out_of_support', stress_percentile: 0.12, stress_tier: null,
    support: { in_support: false, nn_z_distance: 9.0 },
  })
  expect(v.kind).toBe('stress_out_of_support')
  expect(v.showsPercent).toBe(false)
})
