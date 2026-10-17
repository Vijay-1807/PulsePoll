export function LiveDot({ label = 'LIVE' }: { label?: string }) {
  return (
    <span className="chip border-emerald-400/25 bg-emerald-400/10 text-emerald-300">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </span>
      {label}
    </span>
  )
}

export function ClosedDot({ label = 'CLOSED' }: { label?: string }) {
  return (
    <span className="chip border-slate-500/25 bg-slate-500/10 text-slate-400">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
      {label}
    </span>
  )
}
