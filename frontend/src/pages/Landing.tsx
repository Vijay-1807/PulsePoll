import { Link } from 'react-router-dom'
import { ArrowRight, Eye, Radio, Share2, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Logo } from '../components/Logo'
import { LiveDot } from '../components/LiveDot'
import { GradientBackground } from '@/components/ui/pipo'
import { useAuth } from '../lib/auth'

const demoOptions = [
  { text: 'Ship it Friday', base: 38 },
  { text: 'One more sprint', base: 24 },
  { text: 'Needs a rewrite', base: 31 },
  { text: "I'm just here", base: 18 },
]

function DemoCard() {
  const [counts, setCounts] = useState(demoOptions.map((o) => o.base))
  const [watching, setWatching] = useState(24)

  useEffect(() => {
    const t = window.setInterval(() => {
      setCounts((prev) => {
        const next = [...prev]
        next[Math.floor(Math.random() * next.length)] += 1 + Math.floor(Math.random() * 3)
        return next
      })
      setWatching((w) => Math.max(9, w + (Math.random() > 0.5 ? 1 : -1)))
    }, 1600)
    return () => window.clearInterval(t)
  }, [])

  const total = counts.reduce((a, b) => a + b, 0)

  return (
    <div className="card w-full max-w-md p-6 shadow-lift">
      <div className="mb-5 flex items-center justify-between">
        <LiveDot />
        <span className="flex items-center gap-1.5 text-xs text-ink-500">
          <Eye className="h-3.5 w-3.5" /> {watching} watching
        </span>
      </div>
      <h3 className="heading text-lg">Ship the launch on Friday?</h3>
      <div className="mt-5 flex flex-col gap-3.5">
        {demoOptions.map((opt, i) => {
          const pct = (counts[i] / total) * 100
          return (
            <div key={opt.text}>
              <div className="mb-1.5 flex justify-between text-[13px]">
                <span className="text-ink-700">{opt.text}</span>
                <span className="font-mono tabular-nums text-ink-500">{counts[i]}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full border border-paper-300 bg-paper-200">
                <div
                  className="h-full rounded-full bg-clay-400 transition-[width] duration-700 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-5 text-center font-mono text-xs text-ink-400">{total} votes · updating live, no refresh</p>
    </div>
  )
}

export function Landing() {
  const { user } = useAuth()

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[620px] [mask-image:linear-gradient(to_bottom,black_50%,transparent)]">
        <GradientBackground className="h-full w-full" />
      </div>

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-3">
          {user ? (
            <Link to="/dashboard" className="btn-primary">
              Dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">
                Log in
              </Link>
              <Link to="/signup" className="btn-primary">
                Get started
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="relative z-10 mx-auto grid max-w-6xl items-center gap-14 px-6 pb-20 pt-12 lg:grid-cols-2 lg:pt-20">
        <div>
          <span className="chip mb-6 border-clay-200 bg-clay-100 text-clay-800">
            <Sparkles className="h-3 w-3" /> Live polling for rooms, events & teams
          </span>
          <h1 className="heading text-balance text-[42px] leading-[1.06] sm:text-6xl">
            Ask the room.
            <br />
            Watch answers{' '}
            <em className="italic text-clay-600">land live</em>.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-600">
            Create a poll, share one link, and every screen updates in real time as votes arrive. No refreshes, no
            spreadsheets, no waiting.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link to={user ? '/polls/new' : '/signup'} className="btn-primary !px-6 !py-3 text-base">
              Create your first poll <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to={user ? '/dashboard' : '/login'} className="btn-ghost !px-6 !py-3 text-base">
              I have an account
            </Link>
          </div>

          <div className="mt-12 grid grid-cols-3 gap-6 border-t border-paper-300 pt-7">
            <div>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-clay-200 bg-clay-100 text-clay-700">
                <Zap className="h-4 w-4" />
              </span>
              <div className="mt-2.5 text-sm font-semibold text-ink-900">Real-time</div>
              <p className="mt-1 text-[13px] leading-snug text-ink-500">Redis pub/sub pushes every vote to all watchers</p>
            </div>
            <div>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-moss-200 bg-moss-100 text-moss-700">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div className="mt-2.5 text-sm font-semibold text-ink-900">One vote each</div>
              <p className="mt-1 text-[13px] leading-snug text-ink-500">Server-side fingerprinting keeps results honest</p>
            </div>
            <div>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-cornflower-200 bg-cornflower-100 text-cornflower-700">
                <Share2 className="h-4 w-4" />
              </span>
              <div className="mt-2.5 text-sm font-semibold text-ink-900">Zero friction</div>
              <p className="mt-1 text-[13px] leading-snug text-ink-500">Share a link or QR — voting needs no account</p>
            </div>
          </div>
        </div>

        <div className="flex justify-center lg:justify-end">
          <div className="w-full max-w-md animate-fade-up">
            <DemoCard />
            <p className="mt-3 text-center font-mono text-[11px] text-ink-400">sample — the real thing moves faster</p>
          </div>
        </div>
      </main>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-10 border-t border-paper-300 pt-10 sm:grid-cols-3">
          {[
            { step: '01', title: 'Create', text: 'Write your question, add 2–8 options, set a timer if you like.' },
            { step: '02', title: 'Share', text: 'Drop the link in the room chat or let people scan the QR code.' },
            { step: '03', title: 'Watch', text: 'Results move the moment someone taps — on every screen at once.' },
          ].map((s) => (
            <div key={s.step}>
              <span className="font-display text-3xl font-semibold italic text-clay-500">{s.step}</span>
              <h3 className="heading mt-2 text-lg">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-paper-300 bg-paper-50/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-7 text-sm text-ink-400">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-clay-500" />
            PulsePoll — built with React, Go, MongoDB & Redis
          </div>
          <span>Live polling, no refresh required.</span>
        </div>
      </footer>
    </div>
  )
}
