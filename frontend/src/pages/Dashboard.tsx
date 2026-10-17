import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Download,
  Eye,
  Link2,
  Lock,
  LogOut,
  Plus,
  QrCode,
  RefreshCw,
  Trash2,
  Unlock,
  Users,
  Zap,
} from 'lucide-react'
import { Logo } from '../components/Logo'
import { LiveDot, ClosedDot } from '../components/LiveDot'
import { PageLoader } from '../components/Spinner'
import { ShareModal } from '../components/ShareModal'
import { toast } from '../components/Toaster'
import { api, ApiError, shareUrl } from '../lib/api'
import { useAuth } from '../lib/auth'
import { compact } from '../lib/format'
import type { PollSummary } from '../types'

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="card flex items-center gap-3.5 px-5 py-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-300">{icon}</span>
      <div>
        <div className="text-xl font-bold tabular-nums text-white">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  )
}

function PollCard({
  poll,
  onShare,
  onChanged,
}: {
  poll: PollSummary
  onShare: (p: PollSummary) => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const expired = poll.expiresAt && new Date(poll.expiresAt).getTime() < Date.now()
  const closed = poll.closed || expired
  const top = useMemo(() => {
    const sorted = [...poll.options].sort((a, b) => (poll.counts[b.id] ?? 0) - (poll.counts[a.id] ?? 0))
    return sorted[0]
  }, [poll])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(poll.slug))
      toast('Link copied', 'success')
    } catch {
      toast('Could not copy link', 'error')
    }
  }

  const toggleClosed = async () => {
    setBusy(true)
    try {
      await api(`/api/polls/${poll.id}`, { method: 'PATCH', body: { closed: !poll.closed }, token: localStorage.getItem('pp_token') })
      toast(poll.closed ? 'Poll reopened' : 'Poll closed', 'success')
      onChanged()
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update poll', 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await api(`/api/polls/${poll.id}`, { method: 'DELETE', token: localStorage.getItem('pp_token') })
      toast('Poll deleted', 'success')
      onChanged()
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete poll', 'error')
      setBusy(false)
    }
  }

  const exportCsv = async () => {
    try {
      const token = localStorage.getItem('pp_token')
      const res = await fetch(`/api/polls/${poll.id}/export.csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `pulsepoll-${poll.slug}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      toast('Could not export results', 'error')
    }
  }

  return (
    <div className="card flex flex-col p-5 transition hover:border-white/[0.13]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {closed ? <ClosedDot /> : <LiveDot />}
            <span className="font-mono text-[11px] text-slate-500">/p/{poll.slug}</span>
          </div>
          <h3 className="mt-2.5 line-clamp-2 text-[15px] font-bold leading-snug text-white">{poll.question}</h3>
        </div>
        <span className="shrink-0 rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-center">
          <span className="block text-lg font-extrabold tabular-nums text-white">{compact(poll.totalVotes)}</span>
          <span className="block text-[10px] uppercase tracking-wider text-slate-500">votes</span>
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {poll.options.slice(0, 3).map((o) => {
          const pct = poll.totalVotes > 0 ? ((poll.counts[o.id] ?? 0) / poll.totalVotes) * 100 : 0
          return (
            <div key={o.id}>
              <div className="flex justify-between text-[12px] text-slate-400">
                <span className="truncate">{o.text}</span>
                <span className="tabular-nums">{poll.counts[o.id] ?? 0}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ${
                    o.id === top?.id && poll.totalVotes > 0
                      ? 'bg-gradient-to-r from-brand-500 to-fuchsia-500'
                      : 'bg-slate-600'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center gap-3 text-[12px] text-slate-500">
        <span className="flex items-center gap-1">
          <Eye className="h-3.5 w-3.5" /> {poll.viewers} watching
        </span>
        <span>·</span>
        <span>{new Date(poll.createdAt).toLocaleDateString()}</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
        <Link to={`/p/${poll.slug}`} className="btn-ghost !px-3 !py-2 text-xs">
          <BarChart3 className="h-3.5 w-3.5" /> Open
        </Link>
        <button onClick={copyLink} className="btn-ghost !px-3 !py-2 text-xs">
          <Link2 className="h-3.5 w-3.5" /> Copy link
        </button>
        <button onClick={() => onShare(poll)} className="btn-ghost !px-3 !py-2 text-xs">
          <QrCode className="h-3.5 w-3.5" /> QR
        </button>
        <button onClick={exportCsv} className="btn-ghost !px-3 !py-2 text-xs">
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
        <button onClick={toggleClosed} disabled={busy || !!expired} className="btn-ghost !px-3 !py-2 text-xs">
          {poll.closed ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {poll.closed ? 'Reopen' : 'Close'}
        </button>
        {confirmDelete ? (
          <span className="ml-auto flex items-center gap-2">
            <button onClick={remove} disabled={busy} className="btn-danger !px-3 !py-2 text-xs">
              Sure?
            </button>
            <button onClick={() => setConfirmDelete(false)} className="btn-ghost !px-3 !py-2 text-xs">
              No
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="btn-ghost ml-auto !px-3 !py-2 text-xs hover:!border-rose-500/30 hover:!text-rose-300"
            aria-label="Delete poll"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

export function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [polls, setPolls] = useState<PollSummary[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [sharePoll, setSharePoll] = useState<PollSummary | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const res = await api<{ polls: PollSummary[] }>('/api/polls', { token: localStorage.getItem('pp_token') })
      setPolls(res.polls ?? [])
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logout()
        navigate('/login')
        return
      }
      toast('Could not load your polls', 'error')
      setPolls([])
    } finally {
      setRefreshing(false)
    }
  }, [logout, navigate])

  useEffect(() => {
    void load(true)
    const t = window.setInterval(() => void load(true), 10000)
    return () => window.clearInterval(t)
  }, [load])

  const stats = useMemo(() => {
    const list = polls ?? []
    return {
      active: list.filter((p) => !p.closed).length,
      votes: list.reduce((a, p) => a + p.totalVotes, 0),
      viewers: list.reduce((a, p) => a + p.viewers, 0),
      total: list.length,
    }
  }, [polls])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-400 sm:block">
              Hey, <span className="font-semibold text-slate-200">{user?.name}</span>
            </span>
            <Link to="/polls/new" className="btn-primary !py-2 text-sm">
              <Plus className="h-4 w-4" /> New poll
            </Link>
            <button onClick={() => { logout(); navigate('/') }} className="btn-ghost !px-3 !py-2" aria-label="Log out" title="Log out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">Your polls</h1>
            <p className="mt-1 text-sm text-slate-400">Totals below refresh every 10 seconds — open a poll to see votes land live.</p>
          </div>
          <button onClick={() => void load()} className="btn-ghost !px-3 !py-2 text-xs" disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={<BarChart3 className="h-5 w-5" />} label="Polls created" value={String(stats.total)} />
          <StatCard icon={<Zap className="h-5 w-5" />} label="Active polls" value={String(stats.active)} />
          <StatCard icon={<Users className="h-5 w-5" />} label="Total votes" value={compact(stats.votes)} />
          <StatCard icon={<Eye className="h-5 w-5" />} label="Watching right now" value={String(stats.viewers)} />
        </div>

        <div className="mt-8">
          {polls === null ? (
            <PageLoader />
          ) : polls.length === 0 ? (
            <div className="card flex flex-col items-center px-6 py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300">
                <Plus className="h-7 w-7" />
              </span>
              <h2 className="mt-4 text-lg font-bold text-white">No polls yet</h2>
              <p className="mt-1.5 max-w-sm text-sm text-slate-400">
                Create your first poll and share the link — everyone watching will see results update live.
              </p>
              <Link to="/polls/new" className="btn-primary mt-6">
                Create a poll
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {polls.map((p) => (
                <PollCard key={p.id} poll={p} onShare={setSharePoll} onChanged={() => void load()} />
              ))}
            </div>
          )}
        </div>
      </main>

      {sharePoll && (
        <ShareModal
          open={!!sharePoll}
          onClose={() => setSharePoll(null)}
          url={shareUrl(sharePoll.slug)}
          question={sharePoll.question}
        />
      )}
    </div>
  )
}
