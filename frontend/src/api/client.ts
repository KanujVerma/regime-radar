import type {
  CurrentStateResponse,
  HistoricalStateResponse,
  EventReplayResponse,
  ModelDriversResponse,
  ScenarioRequest,
  ScenarioResponse,
} from '../types/api'

const BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000'

async function get<T>(path: string): Promise<T> {
  const resp = await fetch(`${BASE_URL}${path}`)
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText} — ${path}`)
  return resp.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText} — ${path}`)
  return resp.json() as Promise<T>
}

export const api = {
  currentState: () => get<CurrentStateResponse>('/current-state'),
  historicalState: (start = '2020-01-01') =>
    get<HistoricalStateResponse>(`/historical-state?start=${start}`),
  eventReplay: (name: string) =>
    get<EventReplayResponse>(`/event-replay/${name}`),
  modelDrivers: () => get<ModelDriversResponse>('/model-drivers'),
  scenario: (body: ScenarioRequest) =>
    post<ScenarioResponse>('/scenario', body),
}
