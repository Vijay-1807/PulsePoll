// Thin fetch wrapper: single place that knows about the API base URL, the
// bearer token and the backend's error envelope ({error, fields}).
const API_BASE: string = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  status: number
  fields?: Record<string, string>

  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  token?: string | null
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.')
  }

  if (res.status === 204) return undefined as T

  const isJson = res.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await res.json() : null

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.fields)
  }
  return data as T
}

export function wsUrl(path: string): string {
  const base = API_BASE || window.location.origin
  const url = new URL(path, base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export function shareUrl(slug: string): string {
  return `${window.location.origin}/p/${slug}`
}

export async function downloadPollCsv(pollId: string, slug: string): Promise<void> {
  const token = localStorage.getItem('pp_token')
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const url = `${API_BASE}/api/polls/${pollId}/export.csv`
  const res = await fetch(url, { headers })

  if (!res.ok) {
    throw new ApiError(res.status, 'Could not export poll results')
  }

  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('text/html')) {
    throw new ApiError(500, 'Invalid server response: received HTML instead of CSV')
  }

  const blob = await res.blob()
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = `pulsepoll-${slug}-results.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(blobUrl)
}
