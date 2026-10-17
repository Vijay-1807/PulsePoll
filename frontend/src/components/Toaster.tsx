import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react'

type ToastKind = 'success' | 'error' | 'info'
interface Toast {
  id: number
  kind: ToastKind
  message: string
}

let nextId = 1

export function toast(message: string, kind: ToastKind = 'info') {
  window.dispatchEvent(new CustomEvent('pp-toast', { detail: { id: nextId++, kind, message } }))
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const onToast = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail
      setToasts((prev) => [...prev.slice(-3), t])
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id))
      }, 3500)
    }
    window.addEventListener('pp-toast', onToast)
    return () => window.removeEventListener('pp-toast', onToast)
  }, [])

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-paper-300 bg-white px-4 py-3 text-sm text-ink-800 shadow-lift animate-fade-up"
        >
          {t.kind === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 text-moss-600" />}
          {t.kind === 'error' && <AlertTriangle className="h-4 w-4 shrink-0 text-brick-500" />}
          {t.kind === 'info' && <Info className="h-4 w-4 shrink-0 text-cornflower-600" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
