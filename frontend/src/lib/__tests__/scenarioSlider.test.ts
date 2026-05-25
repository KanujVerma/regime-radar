import { describe, it, expect } from 'vitest'
import { formatSliderValue } from '../../components/ui/ScenarioSlider'

describe('formatSliderValue', () => {
  it('formats to correct decimal places', () => {
    expect(formatSliderValue(0.123, 2)).toBe('0.12')
    expect(formatSliderValue(25.5, 1)).toBe('25.5')
    expect(formatSliderValue(100, 0)).toBe('100')
  })
})
