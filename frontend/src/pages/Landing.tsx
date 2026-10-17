import { Link } from 'react-router-dom'
import { ArrowRight, Radio, Share2, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Logo } from '../components/Logo'
import { LiveDot } from '../components/LiveDot'
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
    <div className="card relative w-full max-w-md p-6 shadow-2xl shadow-brand-600/10">
      <div className="mb-5 flex items-center justify-between">
        <LiveDot />
        <span className="text-xs text-slate-400">{watching} watching</span>
      </div>
      <h3 className="text-lg font-bold text-white">Ship the launch on Friday?</h3>
      <div className="mt-5 flex flex-col gap-3.5">
        {demoOptions.map((opt, i) => {
          const pct = (counts[i] / total) * 100
          return (
            <div key={opt.text}>
              <div className="mb-1.5 flex justify-between text-[13px]">
                <span className="text-slate-300">{opt.text}</span>
                <span className="font-mono text-slate-400">{counts[i]}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-500 transition-[width] duration-700 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-5 text-center text-xs text-slate-500">{total} votes · updating live, no refresh</p>
    </div>
  )
}

export function Landing() {
  const { user } = useAuth()

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[140px] animate-blob" />

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

      <main className="relative z-10 mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 pt-14 lg:grid-cols-2 lg:pt-24">
        <div>
          <span className="chip mb-6 border-brand-400/25 bg-brand-400/10 text-brand-300">
            <Sparkles className="h-3 w-3" /> Live polling for rooms, events & teams
          </span>
          <h1 className="text-balance text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-6xl">
            Ask the room.
            <br />
            Watch answers <span className="text-gradient">land live</span>.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-400">
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

          <div className="mt-12 grid grid-cols-3 gap-4 border-t border-white/[0.06] pt-7">
            <div>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
                <Zap className="h-4 w-4 text-brand-400" /> Real-time
              </div>
              <p className="mt-1 text-[13px] leading-snug text-slate-500">Redis pub/sub pushes every vote to all watchers</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
                <ShieldCheck className="h-4 w-4 text-brand-400" /> One vote each
              </div>
              <p className="mt-1 text-[13px] leading-snug text-slate-500">Server-side fingerprinting keeps results honest</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
                <Share2 className="h-4 w-4 text-brand-400" /> Zero friction
              </div>
              <p className="mt-1 text-[13px] leading-snug text-slate-500">Share a link or QR — voting needs no account</p>
            </div>
          </div>
        </div>

        <div className="flex justify-center lg:justify-end">
          <div className="relative">
            <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-brand-600/20 to-fuchsia-600/10 blur-2xl" />
            <div className="relative animate-fade-up">
              <DemoCard />
            </div>
          </div>
        </div>
      </main>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <div className="card grid gap-8 p-8 sm:grid-cols-3">
          {[
            { step: '01', title: 'Create', text: 'Write your question, add 2–8 options, set a timer if you like.' },
            { step: '02', title: 'Share', text: 'Drop the link in the room chat or let people scan the QR code.' },
            { step: '03', title: 'Watch', text: 'Results move the moment someone taps — on every screen at once.' },
          ].map((s) => (
            <div key={s.step}>
              <span className="font-mono text-sm font-semibold text-brand-400">{s.step}</span>
              <h3 className="mt-2 text-lg font-bold text-white">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-7 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-brand-400" />
            PulsePoll — built with React, Go, MongoDB & Redis
          </div>
          <span>Live polling, no refresh required.</span>
        </div>
      </footer>
    </div>
  )
}
