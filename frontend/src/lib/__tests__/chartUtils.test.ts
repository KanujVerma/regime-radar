import { describe, it, expect } from 'vitest'
import { buildRegimeBands } from '../chartUtils'

const pt = (date: string, regime: string) => ({ date, regime, transition_risk: null, vix_level: null, close: null })

describe('buildRegimeBands', () => {
  it('returns [] for empty data', () => {
    expect(buildRegimeBands([], r => r.regime, r => r.date)).toEqual([])
  })

  it('returns one band for uniform regime', () => {
    const data = [pt('2020-01-01', 'calm'), pt('2020-01-02', 'calm')]
    expect(buildRegimeBands(data, r => r.regime, r => r.date)).toEqual([
      { start: '2020-01-01', end: '2020-01-02', regime: 'calm' },
    ])
  })

  it('splits on regime change', () => {
    const data = [pt('2020-01-01', 'calm'), pt('2020-01-02', 'elevated'), pt('2020-01-03', 'elevated')]
    const bands = buildRegimeBands(data, r => r.regime, r => r.date)
    expect(bands).toHaveLength(2)
    expect(bands[0]).toEqual({ start: '2020-01-01', end: '2020-01-02', regime: 'calm' })
    expect(bands[1]).toEqual({ start: '2020-01-02', end: '2020-01-03', regime: 'elevated' })
  })

  it('works with a custom regime getter (EventReplayPoint style)', () => {
    const data = [
      { date: '2020-01-01', regime_actual: 'calm' },
      { date: '2020-01-02', regime_actual: 'turbulent' },
    ]
    const bands = buildRegimeBands(data, r => r.regime_actual, r => r.date)
    expect(bands).toHaveLength(2)
    expect(bands[0].regime).toBe('calm')
    expect(bands[1].regime).toBe('turbulent')
  })
})
