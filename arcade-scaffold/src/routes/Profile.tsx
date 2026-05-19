import { useParams } from 'react-router-dom';

export function Profile() {
  const { callsign } = useParams<{ callsign: string }>();
  return (
    <main style={{ padding: 'var(--space-8)', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ color: 'var(--accent)' }}>{callsign}</h1>
      <p style={{ opacity: 0.7 }}>
        Public stat card — career numbers across all games, signature game, shareable URL.
      </p>
    </main>
  );
}
