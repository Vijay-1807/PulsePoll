import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, GripVertical, Plus, Timer, Trash2 } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Spinner } from '../components/Spinner'
import { toast } from '../components/Toaster'
import { api, ApiError } from '../lib/api'
import type { Poll } from '../types'

const EXPIRY_OPTIONS = [
  { label: 'No timer', minutes: 0 },
  { label: '15 minutes', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '24 hours', minutes: 1440 },
  { label: '7 days', minutes: 10080 },
]

export function CreatePoll() {
  const navigate = useNavigate()
  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [options, setOptions] = useState(['', ''])
  const [multiSelect, setMultiSelect] = useState(false)
  const [expiresInMinutes, setExpiresInMinutes] = useState(0)
  const [busy, setBusy] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const setOption = (i: number, value: string) => {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)))
  }

  const addOption = () => {
    if (options.length >= 8) {
      toast('8 options is the maximum', 'error')
      return
    }
    setOptions((prev) => [...prev, ''])
  }

  const removeOption = (i: number) => {
    if (options.length <= 2) return
    setOptions((prev) => prev.filter((_, idx) => idx !== i))
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setFieldErrors({})
    try {
      const cleaned = options.map((o) => o.trim()).filter(Boolean)
      if (cleaned.length < 2) {
        setFieldErrors({ options: 'Add at least 2 options' })
        return
      }
      const res = await api<{ poll: Poll }>('/api/polls', {
        method: 'POST',
        token: localStorage.getItem('pp_token'),
        body: {
          question: question.trim(),
          description: description.trim(),
          options: cleaned,
          multiSelect,
          expiresInMinutes,
        },
      })
      toast('Poll created — share the link!', 'success')
      navigate(`/p/${res.poll.slug}`)
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setFieldErrors(err.fields)
        toast(Object.values(err.fields)[0] ?? 'Please check the form', 'error')
      } else {
        toast(err instanceof ApiError ? err.message : 'Could not create poll', 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  const qErr = fieldErrors.question
  const oErr = fieldErrors.options

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-5">
        <Logo to="/dashboard" />
        <Link to="/dashboard" className="btn-ghost !py-2 text-sm">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-24">
        <h1 className="heading text-2xl">Create a poll</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Write your question, add options, and share the link. Results update live for everyone watching.
        </p>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
          <section className="card p-6">
            <label className="label" htmlFor="question">
              Question
            </label>
            <input
              id="question"
              className="input text-base"
              placeholder="What should we build next?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={200}
              required
            />
            {qErr && <p className="mt-1.5 text-xs text-brick-600">{qErr}</p>}
            <div className="mt-4">
              <label className="label" htmlFor="description">
                Description <span className="font-normal text-ink-300">(optional)</span>
              </label>
              <textarea
                id="description"
                className="input resize-none"
                rows={2}
                maxLength={500}
                placeholder="Add context for your audience…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </section>

          <section className="card p-6">
            <div className="mb-4 flex items-center justify-between">
              <label className="label !mb-0">Options</label>
              <span className="font-mono text-xs text-ink-400">{options.length}/8</span>
            </div>
            <div className="flex flex-col gap-3">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 shrink-0 text-ink-200" />
                  <input
                    className="input"
                    placeholder={`Option ${i + 1}`}
                    value={opt}
                    onChange={(e) => setOption(i, e.target.value)}
                    maxLength={80}
                    required={i < 2}
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    disabled={options.length <= 2}
                    className="rounded-lg p-2 text-ink-300 transition hover:bg-brick-50 hover:text-brick-600 disabled:opacity-30"
                    aria-label={`Remove option ${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            {oErr && <p className="mt-2 text-xs text-brick-600">{oErr}</p>}
            <button type="button" onClick={addOption} className="btn-ghost mt-4 w-full border-dashed text-sm">
              <Plus className="h-4 w-4" /> Add option
            </button>
          </section>

          <section className="card grid gap-6 p-6 sm:grid-cols-2">
            <div>
              <label className="label">Voting mode</label>
              <div className="flex rounded-xl border border-paper-300 bg-paper-100 p-1">
                <button
                  type="button"
                  onClick={() => setMultiSelect(false)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    !multiSelect
                      ? 'border-paper-300 bg-white text-ink-950 shadow-sm'
                      : 'border-transparent text-ink-500 hover:text-ink-800'
                  }`}
                >
                  Single choice
                </button>
                <button
                  type="button"
                  onClick={() => setMultiSelect(true)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    multiSelect
                      ? 'border-paper-300 bg-white text-ink-950 shadow-sm'
                      : 'border-transparent text-ink-500 hover:text-ink-800'
                  }`}
                >
                  Multi-select
                </button>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="expiry">
                <span className="inline-flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5" /> Auto-close
                </span>
              </label>
              <select
                id="expiry"
                className="input"
                value={expiresInMinutes}
                onChange={(e) => setExpiresInMinutes(Number(e.target.value))}
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.minutes} value={o.minutes} className="bg-white text-ink-900">
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <div className="flex items-center justify-end gap-3">
            <Link to="/dashboard" className="btn-ghost">
              Cancel
            </Link>
            <button type="submit" className="btn-primary !px-6 !py-3" disabled={busy}>
              {busy && <Spinner className="h-4 w-4" />}
              Create poll
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
