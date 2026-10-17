import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { KeyRound, Mail, UserRound } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Spinner } from '../components/Spinner'
import { toast } from '../components/Toaster'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'

interface AuthFormProps {
  mode: 'login' | 'signup'
}

export function AuthForm({ mode }: AuthFormProps) {
  const { login, signup } = useAuth()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: string } }
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const isSignup = mode === 'signup'

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setFieldErrors({})
    try {
      if (isSignup) {
        await signup(name, email, password)
        toast('Welcome to PulsePoll!', 'success')
      } else {
        await login(email, password)
        toast('Logged in', 'success')
      }
      navigate(location.state?.from ?? '/dashboard', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setFieldErrors(err.fields)
      } else if (err instanceof ApiError) {
        toast(err.message, 'error')
      } else {
        toast('Something went wrong', 'error')
      }
    } finally {
      setBusy(false)
    }
  }

  const fieldError = (key: string) =>
    fieldErrors[key] && <p className="mt-1.5 text-xs text-rose-400">{fieldErrors[key]}</p>

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm animate-fade-up">
          <h1 className="text-2xl font-extrabold tracking-tight text-white">
            {isSignup ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            {isSignup ? 'You need an account to create and manage polls.' : 'Log in to manage your polls.'}
          </p>

          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
            {isSignup && (
              <div>
                <label className="label" htmlFor="name">
                  Name
                </label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    id="name"
                    className="input !pl-10"
                    placeholder="Ada Lovelace"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                </div>
                {fieldError('name')}
              </div>
            )}
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="email"
                  type="email"
                  className="input !pl-10"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              {fieldError('email')}
            </div>
            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="password"
                  type="password"
                  className="input !pl-10"
                  placeholder={isSignup ? 'At least 8 characters' : '••••••••'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  required
                  minLength={isSignup ? 8 : undefined}
                />
              </div>
              {fieldError('password')}
            </div>

            <button type="submit" className="btn-primary mt-2 w-full !py-3" disabled={busy}>
              {busy && <Spinner className="h-4 w-4" />}
              {isSignup ? 'Create account' : 'Log in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-400">
            {isSignup ? (
              <>
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-brand-300 hover:text-brand-200">
                  Log in
                </Link>
              </>
            ) : (
              <>
                New here?{' '}
                <Link to="/signup" className="font-semibold text-brand-300 hover:text-brand-200">
                  Create an account
                </Link>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  )
}

export function Login() {
  return <AuthForm mode="login" />
}

export function Signup() {
  return <AuthForm mode="signup" />
}
