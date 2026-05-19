/**
 * Basketball — placeholder. Game scene lifts from the SolShot repo's
 * `arcade/basketball` branch at `client/src/games/basketball/`.
 *
 * Once lifted, mount the Phaser scene here. Server-authoritative scoring
 * unchanged — `apiFetch` to `/api/arcade/score` with the attempt result.
 */
export function Basketball() {
  return (
    <main style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
      <h1 style={{ color: 'var(--accent)' }}>Basketball</h1>
      <p style={{ opacity: 0.7 }}>
        Lift the Phaser scene from <code>arcade/basketball</code> branch ·{' '}
        <code>client/src/games/basketball/</code>
      </p>
    </main>
  );
}
