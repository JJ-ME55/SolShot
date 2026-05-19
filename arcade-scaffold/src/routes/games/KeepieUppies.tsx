/**
 * Keepie Uppies — placeholder. Game scene lifts from the SolShot repo's
 * `arcade/keepie-uppies` branch at `client/src/games/keepie-uppies/`.
 *
 * Once lifted, mount the Phaser scene here. Server-authoritative scoring
 * unchanged — `apiFetch` to `/api/arcade/score` with the attempt result.
 */
export function KeepieUppies() {
  return (
    <main style={{ padding: 'var(--space-8)', textAlign: 'center' }}>
      <h1 style={{ color: 'var(--accent)' }}>Keepie Uppies</h1>
      <p style={{ opacity: 0.7 }}>
        Lift the Phaser scene from <code>arcade/keepie-uppies</code> branch ·{' '}
        <code>client/src/games/keepie-uppies/</code>
      </p>
    </main>
  );
}
