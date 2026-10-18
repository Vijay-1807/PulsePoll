import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface TimelinePoint {
  t: number
  votes: number
}

const TICK = {
  fontSize: 10,
  fill: '#948B76',
  fontFamily: '"JetBrains Mono Variable", monospace',
} as const

function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value?: number | string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const value = Number(payload[0]?.value ?? 0)
  return (
    <div className="rounded-lg border border-paper-300 bg-white px-3 py-1.5 text-xs shadow-card">
      <span className="font-mono text-ink-400">{label}</span>
      <span className="ml-2 font-semibold text-ink-900">
        {value} {value === 1 ? 'vote' : 'votes'}
      </span>
    </div>
  )
}

// Votes-over-time area chart for the live results panel. The series is padded
// to a continuous minute-by-minute window so the shape stays honest between
// bursts of votes.
export function VotesChart({ points }: { points: TimelinePoint[] }) {
  if (points.length < 2) {
    return (
      <div className="flex h-[132px] items-center justify-center rounded-xl border border-dashed border-paper-300 bg-paper-50/60 px-4 text-center text-xs text-ink-400">
        The chart draws itself as votes arrive.
      </div>
    )
  }

  const data = points.map((p) => ({
    label: new Date(p.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    votes: p.votes,
  }))

  return (
    <div className="h-[132px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 28, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="ppVotesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3D82E8" stopOpacity={0.26} />
              <stop offset="100%" stopColor="#3D82E8" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E4DECB" />
          <XAxis
            dataKey="label"
            tick={TICK}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={32}
          />
          <YAxis dataKey="votes" allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} width={36} />
          <Tooltip content={<ChartTip />} cursor={{ stroke: '#D5CCB2', strokeDasharray: '3 3' }} />
          <Area
            type="monotone"
            dataKey="votes"
            stroke="#3D82E8"
            strokeWidth={2}
            fill="url(#ppVotesFill)"
            dot={false}
            activeDot={{ r: 3.5, fill: '#3D82E8', strokeWidth: 0 }}
            isAnimationActive
            animationDuration={450}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
