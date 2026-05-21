import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ReliabilityResponse } from '../types/api'

export function useReliability() {
  const [data, setData] = useState<ReliabilityResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.reliability()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  return { data, loading }
}
