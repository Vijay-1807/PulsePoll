import { Link } from 'react-router-dom'

export function Logo({ to = '/', compact = false }: { to?: string; compact?: boolean }) {
  return (
    <Link to={to} className="group inline-flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-clay-700/30 bg-clay-600 shadow-sm transition group-hover:bg-clay-700">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor" aria-hidden>
          <rect x="4" y="12" width="4" height="8" rx="2" opacity="0.7" />
          <rect x="10" y="7" width="4" height="13" rx="2" />
          <rect x="16" y="3" width="4" height="17" rx="2" opacity="0.9" />
        </svg>
      </span>
      {!compact && (
        <span className="font-display text-[19px] font-semibold tracking-tight text-ink-950">
          Pulse<span className="text-clay-600">Poll</span>
        </span>
      )}
    </Link>
  )
}
