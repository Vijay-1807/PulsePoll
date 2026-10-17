import { Link } from 'react-router-dom'

export function Logo({ to = '/', compact = false }: { to?: string; compact?: boolean }) {
  return (
    <Link to={to} className="group inline-flex items-center gap-2.5">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-fuchsia-500 shadow-glow-sm transition group-hover:shadow-glow">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor" aria-hidden>
          <rect x="4" y="12" width="4" height="8" rx="2" opacity="0.75" />
          <rect x="10" y="7" width="4" height="13" rx="2" />
          <rect x="16" y="3" width="4" height="17" rx="2" opacity="0.9" />
        </svg>
      </span>
      {!compact && (
        <span className="text-[17px] font-bold tracking-tight text-white">
          Pulse<span className="text-gradient">Poll</span>
        </span>
      )}
    </Link>
  )
}
