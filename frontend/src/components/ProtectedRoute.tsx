import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { PageLoader } from './Spinner'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, booting } = useAuth()
  const location = useLocation()

  if (booting) return <PageLoader />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return <>{children}</>
}
