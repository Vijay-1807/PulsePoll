import { useEffect, useRef, useState } from 'react'
import { wsUrl } from './api'
import type { SocketEvent } from '../types'

export type SocketStatus = 'connecting' | 'live' | 'reconnecting' | 'closed'

interface PollSocket {
  status: SocketStatus
  lastEvent: SocketEvent | null
}

// usePollSocket keeps one WebSocket per poll page alive, reconnects with
// backoff, and pings the server so Redis presence stays accurate. Each effect
// run is fully self-contained (its own socket, timers and disposed flag) so
// StrictMode's double-mount cannot leave orphaned connections behind.
export function usePollSocket(slug: string): PollSocket {
  const [status, setStatus] = useState<SocketStatus>('connecting')
  const [lastEvent, setLastEvent] = useState<SocketEvent | null>(null)
  const lastEventRef = useRef<SocketEvent | null>(null)

  useEffect(() => {
    let disposed = false
    let attempts = 0
    let ws: WebSocket | null = null
    let heartbeat: number | undefined
    let reconnect: number | undefined

    const connect = () => {
      if (disposed) return
      setStatus(attempts === 0 ? 'connecting' : 'reconnecting')
      ws = new WebSocket(wsUrl(`/api/ws/polls/${slug}`))

      ws.onopen = () => {
        if (disposed) return
        attempts = 0
        setStatus('live')
        heartbeat = window.setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'heartbeat' }))
          }
        }, 20000)
      }

      ws.onmessage = (e) => {
        if (disposed) return
        try {
          const event = JSON.parse(e.data) as SocketEvent
          lastEventRef.current = event
          setLastEvent(event)
        } catch {
          // Ignore malformed frames.
        }
      }

      ws.onclose = () => {
        window.clearInterval(heartbeat)
        if (disposed) return
        setStatus('reconnecting')
        const delay = Math.min(1000 * 2 ** attempts, 10000)
        attempts += 1
        reconnect = window.setTimeout(connect, delay)
      }

      ws.onerror = () => {
        ws?.close()
      }
    }

    connect()
    return () => {
      disposed = true
      window.clearInterval(heartbeat)
      window.clearTimeout(reconnect)
      ws?.close()
      setStatus('closed')
    }
  }, [slug])

  return { status, lastEvent }
}
