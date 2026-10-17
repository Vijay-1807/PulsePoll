import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { KeyRound, Mail, UserRound } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Spinner } from '../components/Spinner'
import { toast } from '../components/Toaster'
import { GradientBackground } from '@/components/ui/pipo'
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

  const fieldError = (key: string) => fieldErrors[key] && <p className="mt-1.5 text-xs text-brick-600">{fieldErrors[key]}</p>

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[440px] [mask-image:linear-gradient(to_bottom,black_35%,transparent)]">
        <GradientBackground className="h-full w-full" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 pb-20">
        <div className="card w-full max-w-md p-8 animate-fade-up">
          <h1 className="heading text-2xl">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="mt-1.5 text-sm text-ink-500">
            {isSignup ? 'You need an account to create and manage polls.' : 'Log in to manage your polls.'}
          </p>

          <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-4">
            {isSignup && (
              <div>
                <label className="label" htmlFor="name">
                  Name
                </label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
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
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
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
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
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

          <p className="mt-6 border-t border-paper-200 pt-5 text-center text-sm text-ink-500">
            {isSignup ? (
              <>
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-clay-700 hover:text-clay-800 hover:underline">
                  Log in
                </Link>
              </>
            ) : (
              <>
                New here?{' '}
                <Link to="/signup" className="font-semibold text-clay-700 hover:text-clay-800 hover:underline">
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
