import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import type { CurrentStateResponse } from '../types/api'

export function useCurrentState() {
  const [data, setData] = useState<CurrentStateResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await api.currentState()
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])
  return { data, loading, error, refresh }
}
