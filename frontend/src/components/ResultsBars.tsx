import clsx from 'clsx'
import { Crown } from 'lucide-react'
import type { PollOption } from '../types'
import { percent } from '../lib/format'

interface Props {
  options: PollOption[]
  counts: Record<string, number>
  total: number
  myChoices?: string[]
  compact?: boolean
  onPick?: (optionId: string) => void
}

// ResultsBars is the animated heart of the live view: every width change is a
// CSS transition, so a vote arriving over the socket makes the bars glide.
export function ResultsBars({ options, counts, total, myChoices = [], compact = false, onPick }: Props) {
  const max = Math.max(1, ...options.map((o) => counts[o.id] ?? 0))

  return (
    <div className={clsx('flex flex-col', compact ? 'gap-2.5' : 'gap-3.5')}>
      {options.map((opt, idx) => {
        const count = counts[opt.id] ?? 0
        const pct = percent(count, total)
        const mine = myChoices.includes(opt.id)
        const leading = count === max && count > 0 && total > 0
        return (
          <div key={opt.id} className="group animate-fade-up" style={{ animationDelay: `${idx * 40}ms` }}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-[14px] font-medium text-slate-200">
                <span className="truncate">{opt.text}</span>
                {mine && (
                  <span className="shrink-0 rounded-full bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-300">
                    your pick
                  </span>
                )}
                {leading && !compact && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                    <Crown className="h-3 w-3" /> leading
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[13px] tabular-nums text-slate-400">
                {compact ? count : `${count} · ${pct.toFixed(pct >= 10 || pct === 0 ? 0 : 1)}%`}
              </span>
            </div>
            <div
              className={clsx(
                'relative w-full overflow-hidden rounded-full bg-white/[0.05]',
                compact ? 'h-2' : 'h-3',
                onPick && 'cursor-pointer',
              )}
              onClick={onPick ? () => onPick(opt.id) : undefined}
              role={onPick ? 'button' : undefined}
            >
              <div
                className={clsx(
                  'h-full rounded-full transition-[width] duration-700 ease-out',
                  mine
                    ? 'bg-gradient-to-r from-brand-500 to-fuchsia-500 shadow-glow-sm'
                    : leading
                      ? 'bg-gradient-to-r from-brand-400/80 to-fuchsia-400/70'
                      : 'bg-slate-500/60 group-hover:bg-slate-400/70',
                )}
                style={{ width: `${Math.max(pct, total > 0 && count > 0 ? 3 : 0)}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
