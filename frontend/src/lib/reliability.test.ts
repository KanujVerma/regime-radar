import { test, expect } from 'vitest'
import src from './reliability.ts?raw'

test('reliability.ts no longer hardcodes MIN_N or re-derives out_of_range (single source of truth)', () => {
  expect(src).not.toMatch(/const\s+MIN_N\s*=/)
  expect(src).not.toMatch(/out_of_range/)
})
