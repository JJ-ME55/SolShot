import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useArcadeAuth } from '@/wallet/useAuth';

/**
 * Pre-auth landing. Full-bleed dark page with the brand wordmark
 * and tagline; tap-to-sign-in via Privy. Placeholder visual until
 * Fish wires the real cabinet artwork.
 *
 * On successful Privy sign-in, redirects to /dashboard.
 */
export function CabinetLanding() {
  const auth = useArcadeAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.ready && auth.authenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [auth.ready, auth.authenticated, navigate]);

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
        background:
          'radial-gradient(ellipse at center, rgba(122, 15, 15, 0.4) 0%, var(--arcade-black) 70%)',
      }}
    >
      <h1
        style={{
          fontSize: 'clamp(2.5rem, 8vw, 5rem)',
          letterSpacing: '0.08em',
          background: 'var(--fire-gradient)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: 'var(--space-6)',
        }}
      >
        THE ARCADE
      </h1>

      <p
        style={{
          fontFamily: 'var(--font-subhead)',
          fontSize: 'clamp(1rem, 2.5vw, 1.5rem)',
          letterSpacing: '0.2em',
          color: 'var(--accent)',
          marginBottom: 'var(--space-12)',
          textTransform: 'uppercase',
        }}
      >
        Play. Wager. Win. On Solana.
      </p>

      <button
        type="button"
        onClick={auth.login}
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1rem',
          padding: 'var(--space-4) var(--space-8)',
          background: 'var(--fire-gradient)',
          color: 'var(--arcade-black)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 4px 0 var(--shadow-deep)',
          letterSpacing: '0.1em',
          transition: 'transform 100ms ease, box-shadow 100ms ease',
        }}
        onMouseDown={(e) => {
          e.currentTarget.style.transform = 'translateY(2px)';
          e.currentTarget.style.boxShadow = '0 2px 0 var(--shadow-deep)';
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 4px 0 var(--shadow-deep)';
        }}
      >
        Insert Coin
      </button>

      <p
        style={{
          marginTop: 'var(--space-12)',
          fontSize: '0.75rem',
          color: 'var(--paper-warm)',
          opacity: 0.6,
        }}
      >
        Scaffold v0 · placeholder cabinet · real artwork by Fish
      </p>
    </main>
  );
}
