import { useArcadeAuth } from '@/wallet/useAuth';

export function Me() {
  const auth = useArcadeAuth();
  return (
    <main style={{ padding: 'var(--space-8)', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ color: 'var(--accent)' }}>{auth.callsign ?? 'Settings'}</h1>
      <p style={{ opacity: 0.7, marginBottom: 'var(--space-6)' }}>
        Profile + wallet + sign-out. Callsign is locked once chosen.
      </p>
      {auth.authenticated && (
        <button
          type="button"
          onClick={() => {
            void auth.logout();
          }}
          style={{
            padding: 'var(--space-3) var(--space-6)',
            background: 'transparent',
            border: '2px solid var(--accent-live)',
            color: 'var(--accent-live)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-display)',
          }}
        >
          Sign out
        </button>
      )}
    </main>
  );
}
