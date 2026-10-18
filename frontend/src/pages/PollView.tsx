import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import confetti from 'canvas-confetti'
import {
  CheckCircle2,
  Clock,
  Eye,
  Link2,
  Lock,
  QrCode,
  Share2,
  TriangleAlert,
  UserRound,
  Vote as VoteIcon,
} from 'lucide-react'
import { Logo } from '../components/Logo'
import { LiveDot, ClosedDot } from '../components/LiveDot'
import { Spinner } from '../components/Spinner'
import { ResultsBars } from '../components/ResultsBars'
import type { TimelinePoint } from '../components/VotesChart'
import { ShareModal } from '../components/ShareModal'
import { toast } from '../components/Toaster'
import { api, ApiError, shareUrl } from '../lib/api'
import { usePollSocket } from '../lib/socket'
import { getMyVote, saveMyVote, voterId } from '../lib/voter'
import { countdown, timeAgo } from '../lib/format'
import type { PublicPoll, VoteEventPayload } from '../types'

// recharts is sizeable; load it only when a results panel actually renders.
const VotesChart = lazy(() => import('../components/VotesChart').then((m) => ({ default: m.VotesChart })))

interface ActivityItem extends VoteEventPayload {
  key: number
}

// Stretch sparse buckets into a continuous minute-by-minute series so the
// chart always reads as a real timeline, not isolated spikes. A few quiet
// minutes are padded before the first ballot for context.
function fillTimeline(raw: TimelinePoint[]): TimelinePoint[] {
  const minute = 60_000
  const end = Math.floor(Date.now() / minute) * minute
  if (raw.length === 0) return []
  const byT = new Map(raw.map((b) => [b.t, b.votes]))
  const first = Math.min(raw[0].t, end)
  const start = Math.max(first - 4 * minute, end - 119 * minute)
  const out: TimelinePoint[] = []
  for (let t = start; t <= end && out.length < 120; t += minute) {
    out.push({ t, votes: byT.get(t) ?? 0 })
  }
  return out
}

export function PollView() {
  const { slug = '' } = useParams()
  const [poll, setPoll] = useState<PublicPoll | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleted, setDeleted] = useState(false)
  const [myVote, setMyVote] = useState<string[] | null>(() => getMyVote(slug)?.optionIds ?? null)
  const [picked, setPicked] = useState<string[]>([])
  const [voting, setVoting] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [timeline, setTimeline] = useState<TimelinePoint[]>([])
  const [tick, setTick] = useState(0)
  const activityKey = useRef(0)
  const { status, lastEvent } = usePollSocket(slug)

  const loadPoll = useCallback(async () => {
    try {
      const res = await api<{ poll: PublicPoll }>(`/api/polls/slug/${slug}`)
      setPoll(res.poll)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setDeleted(true)
      } else {
        setLoadError(err instanceof ApiError ? err.message : 'Could not load this poll')
      }
    }
  }, [slug])

  useEffect(() => {
    void loadPoll()
  }, [loadPoll])

  // Seed the votes-over-time chart from the durable ballot log.
  useEffect(() => {
    let cancelled = false
    api<{ buckets: TimelinePoint[] }>(`/api/polls/slug/${slug}/timeline`)
      .then((res) => {
        if (!cancelled) setTimeline(fillTimeline(res.buckets ?? []))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [slug])

  // Countdown re-render every second while a timer is set.
  useEffect(() => {
    if (!poll?.expiresAt) return
    const t = window.setInterval(() => setTick((v) => v + 1), 1000)
    return () => window.clearInterval(t)
  }, [poll?.expiresAt])
  void tick

  // Live events: one socket feeds bars, presence, activity and status.
  useEffect(() => {
    if (!lastEvent) return
    if (lastEvent.type === 'deleted') {
      setDeleted(true)
      return
    }
    setPoll((prev) => {
      if (!prev) return prev
      if (lastEvent.type === 'state' || lastEvent.type === 'vote') {
        return { ...prev, counts: lastEvent.payload.counts, totalVotes: lastEvent.payload.total }
      }
      if (lastEvent.type === 'presence') {
        return { ...prev, viewers: lastEvent.payload.viewers }
      }
      if (lastEvent.type === 'status') {
        return { ...prev, closed: lastEvent.payload.closed }
      }
      return prev
    })
    if (lastEvent.type === 'vote') {
      activityKey.current += 1
      setActivity((prev) => [{ ...lastEvent.payload, key: activityKey.current }, ...prev].slice(0, 6))
      setTimeline((prev) => {
        const minute = Math.floor(Date.now() / 60_000) * 60_000
        if (prev.length > 0 && prev[prev.length - 1].t === minute) {
          const next = [...prev]
          next[next.length - 1] = { ...next[next.length - 1], votes: next[next.length - 1].votes + 1 }
          return next
        }
        return [...prev, { t: minute, votes: 1 }].slice(-120)
      })
    }
  }, [lastEvent])

  const expired = poll?.expiresAt ? new Date(poll.expiresAt).getTime() < Date.now() : false
  const closed = (poll?.closed ?? false) || expired
  const hasVoted = myVote !== null

  const togglePick = (optionId: string) => {
    if (closed || hasVoted) return
    if (poll?.multiSelect) {
      setPicked((prev) => (prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]))
    } else {
      setPicked([optionId])
    }
  }

  const submitVote = async () => {
    if (!poll || picked.length === 0 || closed || hasVoted) return
    setVoting(true)
    try {
      const res = await api<{ counts: Record<string, number>; total: number }>(`/api/polls/slug/${slug}/vote`, {
        method: 'POST',
        body: { optionIds: picked, voterId: voterId() },
      })
      setPoll((prev) => (prev ? { ...prev, counts: res.counts, totalVotes: res.total } : prev))
      saveMyVote(slug, picked)
      setMyVote(picked)
      confetti({
        particleCount: 90,
        spread: 72,
        origin: { y: 0.65 },
        colors: ['#C6713C', '#E6B093', '#3D82E8', '#A3CEFF', '#4A753C'],
        disableForReducedMotion: true,
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Already voted from this browser before — reflect it.
        saveMyVote(slug, [])
        setMyVote([])
        toast('You already voted on this poll', 'info')
        void loadPoll()
      } else if (err instanceof ApiError && (err.status === 410 || err.status === 422)) {
        toast(err.message, 'error')
        void loadPoll()
      } else {
        toast(err instanceof ApiError ? err.message : 'Could not submit your vote', 'error')
      }
    } finally {
      setVoting(false)
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(slug))
      toast('Link copied', 'success')
    } catch {
      toast('Could not copy link', 'error')
    }
  }

  const connectionChip = useMemo(() => {
    if (closed) return <ClosedDot />
    if (status === 'live') return <LiveDot />
    return (
      <span className="chip border-gold-200 bg-gold-50 text-gold-700">
        <span className="h-2 w-2 animate-pulse-soft rounded-full bg-gold-500" />
        {status === 'closed' ? 'offline' : 'connecting'}
      </span>
    )
  }, [closed, status])

  if (deleted) {
    return (
      <MessageScreen
        title="This poll no longer exists"
        body="It may have been deleted by its owner. Ask for a fresh link."
      />
    )
  }
  if (loadError) {
    return (
      <MessageScreen
        title="Could not load this poll"
        body={loadError}
        action={
          <button onClick={() => void loadPoll()} className="btn-primary mt-6">
            Try again
          </button>
        }
      />
    )
  }
  if (!poll) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-clay-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <div className="flex items-center gap-2.5">
          <span className="chip hidden border-cornflower-200 bg-cornflower-50 text-cornflower-700 sm:inline-flex">
            <Eye className="h-3 w-3" /> {poll.viewers} watching
          </span>
          <button onClick={copyLink} className="btn-ghost !px-3 !py-2 text-xs" aria-label="Copy poll link">
            <Link2 className="h-3.5 w-3.5" /> Copy link
          </button>
          <button onClick={() => setShareOpen(true)} className="btn-primary !px-3 !py-2 text-xs" aria-label="Share poll">
            <QrCode className="h-3.5 w-3.5" /> Share
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 pb-24 pt-4 lg:grid-cols-[1.2fr_1fr]">
        <section className="animate-fade-up">
          <div className="card p-7">
            <div className="flex flex-wrap items-center gap-2.5">
              {connectionChip}
              {poll.expiresAt && !closed && (
                <span className="chip border-gold-200 bg-gold-50 text-gold-700">
                  <Clock className="h-3 w-3" /> closes in {countdown(poll.expiresAt)}
                </span>
              )}
            </div>

            <h1 className="heading mt-4 text-balance text-2xl leading-tight sm:text-3xl">{poll.question}</h1>
            {poll.description && <p className="mt-3 text-[15px] leading-relaxed text-ink-600">{poll.description}</p>}
            <p className="mt-4 font-mono text-[12px] text-ink-400">
              poll/{poll.slug} · {poll.multiSelect ? 'pick all that apply' : 'pick one'}
            </p>

            {closed && (
              <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-gold-700">
                <Lock className="h-4 w-4 shrink-0" />
                {expired ? 'This poll has reached its closing time.' : 'Voting is closed. Results are final.'}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3">
              {poll.options.map((opt) => {
                const selected = picked.includes(opt.id)
                const mine = myVote?.includes(opt.id) ?? false
                return (
                  <button
                    key={opt.id}
                    onClick={() => togglePick(opt.id)}
                    disabled={closed || hasVoted}
                    data-testid={`option-${opt.id}`}
                    className={`group flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left text-[15px] font-medium transition-all ${
                      selected
                        ? 'border-cornflower-500 bg-cornflower-50 text-ink-950 ring-4 ring-cornflower-500/10'
                        : mine
                          ? 'border-cornflower-300 bg-cornflower-50/60 text-ink-900'
                          : 'border-paper-300 bg-white text-ink-700 hover:border-ink-300 hover:bg-paper-50'
                    } ${closed || hasVoted ? 'cursor-default' : 'cursor-pointer active:scale-[0.995]'}`}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 transition ${
                          poll.multiSelect ? 'rounded-md' : 'rounded-full'
                        } ${selected || mine ? 'border-cornflower-600 bg-cornflower-600 text-white' : 'border-ink-300'}`}
                      >
                        {(selected || mine) && <CheckCircle2 className="h-3.5 w-3.5" />}
                      </span>
                      {opt.text}
                    </span>
                    {mine && (
                      <span className="text-[11px] font-bold uppercase tracking-wider text-cornflower-700">your vote</span>
                    )}
                  </button>
                )
              })}
            </div>

            {!hasVoted && !closed && (
              <button
                onClick={() => void submitVote()}
                disabled={picked.length === 0 || voting}
                className="btn-primary mt-6 w-full !py-3.5 text-base"
                data-testid="submit-vote"
              >
                {voting ? <Spinner className="h-4 w-4" /> : <VoteIcon className="h-4 w-4" />}
                {poll.multiSelect
                  ? picked.length > 0
                    ? `Submit ${picked.length} ${picked.length === 1 ? 'choice' : 'choices'}`
                    : 'Pick at least one option'
                  : 'Cast your vote'}
              </button>
            )}

            {hasVoted && (
              <div className="mt-6 flex items-center gap-2.5 rounded-xl border border-moss-200 bg-moss-50 px-4 py-3 text-sm text-moss-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Vote recorded — watch the results move live.
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-6 animate-fade-up" style={{ animationDelay: '80ms' }}>
          <div className="card p-6" data-testid="results-card">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-400">Live results</h2>
              <span className="text-sm text-ink-500">
                <span
                  key={poll.totalVotes}
                  className="inline-block animate-pop font-display text-2xl font-semibold tabular-nums text-ink-950"
                  data-testid="total-votes"
                >
                  {poll.totalVotes}
                </span>{' '}
                {poll.totalVotes === 1 ? 'vote' : 'votes'}
              </span>
            </div>
            <ResultsBars options={poll.options} counts={poll.counts} total={poll.totalVotes} myChoices={myVote ?? []} />
            {poll.totalVotes === 0 && (
              <p className="mt-5 text-center text-sm text-ink-400">No votes yet — be the first to weigh in.</p>
            )}
            <div className="mt-5 border-t border-paper-200 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">Votes over time</h3>
                <span className="font-mono text-[10px] text-ink-300">last 2h</span>
              </div>
              <Suspense
                fallback={<div className="h-[132px] rounded-xl border border-dashed border-paper-300 bg-paper-50/60" />}
              >
                <VotesChart points={timeline} />
              </Suspense>
            </div>
          </div>

          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-400">Coming in</h2>
              {!closed && (
                <span className="font-mono text-[11px] text-ink-400">
                  {status === 'live' ? 'streaming via websocket' : 'reconnecting…'}
                </span>
              )}
            </div>
            {activity.length === 0 ? (
              <p className="text-sm text-ink-400">
                {closed ? 'Voting has ended.' : 'Nothing yet. Votes will appear here the second they land.'}
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {activity.map((a) => (
                  <li key={a.key} className="flex items-start gap-2.5 text-sm text-ink-600 animate-fade-up">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-clay-200 bg-clay-100 text-clay-700">
                      <UserRound className="h-3 w-3" />
                    </span>
                    <span className="min-w-0 flex-1 leading-snug">
                      Anonymous voter picked{' '}
                      <span className="font-semibold text-ink-950">
                        {a.optionIds.map((id) => poll.options.find((o) => o.id === id)?.text ?? 'an option').join(', ')}
                      </span>
                    </span>
                    <span className="mt-0.5 shrink-0 text-[11px] text-ink-400">{timeAgo(a.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!closed && (
            <div className="card flex items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cornflower-200 bg-cornflower-100 text-cornflower-700">
                  <Share2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink-950">Get more votes</p>
                  <p className="text-xs text-ink-400">Share the link or let people scan the QR code.</p>
                </div>
              </div>
              <button onClick={() => setShareOpen(true)} className="btn-ghost shrink-0 text-xs">
                <QrCode className="h-3.5 w-3.5" /> Open
              </button>
            </div>
          )}
        </section>
      </main>

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} url={shareUrl(slug)} question={poll.question} />
    </div>
  )
}

function MessageScreen({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gold-200 bg-gold-100 text-gold-700">
          <TriangleAlert className="h-7 w-7" />
        </span>
        <h1 className="heading mt-4 text-2xl">{title}</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-500">{body}</p>
        {action}
        <Link to="/" className="mt-4 text-sm font-semibold text-clay-700 hover:text-clay-800 hover:underline">
          Back to home
        </Link>
      </main>
    </div>
  )
}
