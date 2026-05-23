import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { AnalogsResponse } from '../types/api'

export function useAnalogs() {
  const [data, setData] = useState<AnalogsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    api.analogs()
      .then(result => setData(result))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])
  return { data, loading }
}
