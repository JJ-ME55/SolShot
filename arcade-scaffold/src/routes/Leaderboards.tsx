import { useParams } from 'react-router-dom';

export function Leaderboards() {
  const { game } = useParams<{ game?: string }>();
  return (
    <main style={{ padding: 'var(--space-8)', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ color: 'var(--accent)', marginBottom: 'var(--space-6)' }}>
        {game ? `Leaderboard · ${game}` : 'Leaderboards'}
      </h1>
      <p style={{ opacity: 0.7 }}>
        Per-game boards (today / week / all-time) + Arcade Champion cross-game ranking. Wiring
        deferred until JJ + Fish lock the formula.
      </p>
    </main>
  );
}
