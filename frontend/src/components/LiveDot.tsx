export function LiveDot({ label = 'live' }: { label?: string }) {
  return (
    <span className="chip border-moss-200 bg-moss-50 text-moss-700">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-moss-500 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-moss-600" />
      </span>
      {label}
    </span>
  )
}

export function ClosedDot({ label = 'closed' }: { label?: string }) {
  return (
    <span className="chip border-paper-400 bg-paper-200 text-ink-500">
      <span className="h-2 w-2 rounded-full bg-ink-400" />
      {label}
    </span>
  )
}
