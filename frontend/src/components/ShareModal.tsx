import { useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, ExternalLink, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from './Toaster'

interface Props {
  open: boolean
  onClose: () => void
  url: string
  question?: string
}

export function ShareModal({ open, onClose, url, question }: Props) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast('Link copied to clipboard', 'success')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Could not copy — select the link manually', 'error')
    }
  }

  const shareText = question ? `Vote on "${question}"` : 'Vote on this poll'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="card w-full max-w-md p-6 animate-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Share this poll</h3>
            <p className="mt-0.5 text-sm text-slate-400">Scan the code or send the link — results update live for everyone.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex justify-center rounded-2xl border border-white/10 bg-white p-5">
          <QRCodeSVG value={url} size={190} level="M" bgColor="#ffffff" fgColor="#0b0d15" marginSize={0} />
        </div>

        <div className="mt-5 flex items-center gap-2 rounded-xl border border-white/10 bg-ink-850 px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-slate-300">{url}</span>
          <button onClick={copy} className="btn-ghost !px-3 !py-1.5 text-xs" aria-label="Copy link">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <a
            className="btn-ghost text-[13px]"
            href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp
          </a>
          <a
            className="btn-ghost text-[13px]"
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5" /> X / Twitter
          </a>
        </div>
      </div>
    </div>
  )
}
