import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api/client'
import type { ScenarioResponse } from '../types/api'
import type { ScenarioInputs } from '../lib/sliderConfig'

export function useScenario(inputs: ScenarioInputs) {
  const [data, setData] = useState<ScenarioResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const run = useCallback(async (inp: ScenarioInputs) => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.scenario(inp)
      setData(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => run(inputs), 120)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [inputs, run])

  return { data, loading, error }
}
