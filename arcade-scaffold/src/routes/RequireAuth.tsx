import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useArcadeAuth } from '@/wallet/useAuth';

/**
 * Route guard. Redirects unauthenticated users to / (the cabinet)
 * with the intended path in state so the post-sign-in flow can
 * deep-link back.
 *
 * If Privy isn't configured (no VITE_PRIVY_APP_ID), this lets all
 * traffic through — Fish can still navigate the routes during early
 * scaffolding before JJ sets env vars.
 */
export function RequireAuth() {
  const auth = useArcadeAuth();
  const location = useLocation();

  if (!auth.ready) {
    return (
      <main style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
        <p style={{ opacity: 0.6 }}>Loading…</p>
      </main>
    );
  }

  if (!auth.authenticated && import.meta.env.VITE_PRIVY_APP_ID) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
