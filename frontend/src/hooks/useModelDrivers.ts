import { useState, useEffect } from 'react'
import { api } from '../api/client'
import type { ModelDriversResponse } from '../types/api'

export function useModelDrivers() {
  const [data, setData] = useState<ModelDriversResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.modelDrivers()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unknown error'))
      .finally(() => setLoading(false))
  }, [])

  return { data, loading, error }
}
