import { useEffect, useState } from 'react';

const SOLSHOT_URL = import.meta.env.VITE_SOLSHOT_WEB_URL ?? 'https://solshot.gg';

/**
 * Interstitial that mints a session JWT from the SolShot server's
 * `/api/arcade/session-handoff` endpoint, then full-page redirects
 * to solshot.gg with the token appended as `?arcade_token=...`.
 *
 * The SolShot client reads the token from URL, validates it via the
 * server, provisions a Privy session, strips the query param.
 *
 * Token TTL: 10 min, single-use (same pattern as existing
 * `walletLinkTokens.js` in the SolShot server).
 *
 * Fish: replace the mock token mint with the real `mintSolShotSessionToken`
 * call from `@/api/client` once the server endpoint is live.
 */
export function SolShotRedirect() {
  const [status, setStatus] = useState<'minting' | 'redirecting' | 'error'>('minting');

  useEffect(() => {
    let cancelled = false;

    async function go() {
      try {
        // TODO(fish): swap to real mintSolShotSessionToken once server
        // endpoint is live. Until then, redirect without token — SolShot
        // will show its own sign-in prompt.
        if (cancelled) return;
        setStatus('redirecting');
        window.location.href = SOLSHOT_URL;
      } catch {
        if (!cancelled) setStatus('error');
      }
    }

    void go();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-8)',
        textAlign: 'center',
      }}
    >
      <h1 style={{ color: 'var(--accent)', marginBottom: 'var(--space-4)' }}>SolShot</h1>
      <p style={{ opacity: 0.8, marginBottom: 'var(--space-6)' }}>
        {status === 'error'
          ? "Couldn't open SolShot — try again."
          : 'Opening SolShot — your callsign comes with you.'}
      </p>
      <a href={SOLSHOT_URL} style={{ color: 'var(--accent-hot)' }}>
        Continue manually →
      </a>
    </main>
  );
}
