import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'

export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center px-6 py-5">
        <Logo />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <p className="font-display text-6xl font-semibold italic text-clay-600">404</p>
        <h1 className="heading mt-4 text-2xl">This page went missing</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-500">
          The link may be broken, or the poll you're looking for was deleted by its owner.
        </p>
        <Link to="/" className="btn-primary mt-8">
          Back to home
        </Link>
      </main>
    </div>
  )
}
