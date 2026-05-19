import { usePrivy } from '@privy-io/react-auth';

const PRIVY_ENABLED = Boolean(import.meta.env.VITE_PRIVY_APP_ID);

export interface ArcadeAuth {
  ready: boolean;
  authenticated: boolean;
  callsign: string | null;
  login: () => void;
  logout: () => Promise<void>;
}

/**
 * Convenience auth hook. Wraps Privy with safe defaults for the
 * "Privy not yet configured" case so the cabinet landing renders
 * before JJ fills in env vars on Vercel.
 *
 * Callsign source: temporary stub via Privy user metadata. Real
 * implementation reads from SolShot server's `/api/arcade/profile/me`
 * (uses existing TG↔wallet binding to resolve callsign from Privy
 * identity).
 */
export function useArcadeAuth(): ArcadeAuth {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const privy = PRIVY_ENABLED ? usePrivy() : null;

  if (!privy) {
    return {
      ready: true,
      authenticated: false,
      callsign: null,
      login: () => {
        // eslint-disable-next-line no-console
        console.warn('[useArcadeAuth] Privy not configured — VITE_PRIVY_APP_ID missing.');
      },
      logout: async () => {},
    };
  }

  return {
    ready: privy.ready,
    authenticated: privy.authenticated,
    callsign:
      (privy.user?.customMetadata?.callsign as string | undefined) ??
      privy.user?.email?.address ??
      null,
    login: privy.login,
    logout: privy.logout,
  };
}
