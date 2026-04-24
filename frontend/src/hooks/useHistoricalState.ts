import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { HistoricalStateResponse } from '../types/api'

export function useHistoricalState(start = '2020-01-01') {
  const [data, setData] = useState<HistoricalStateResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.historicalState(start)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [start])

  return { data, loading, error }
}
