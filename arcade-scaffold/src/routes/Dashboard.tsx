import { Link } from 'react-router-dom';
import { useArcadeAuth } from '@/wallet/useAuth';

interface GameTile {
  slug: string;
  name: string;
  tagline: string;
  href: string;
}

const GAMES: GameTile[] = [
  {
    slug: 'keepie-uppies',
    name: 'Keepie Uppies',
    tagline: 'How long can you keep the ball up?',
    href: '/play/keepie-uppies',
  },
  {
    slug: 'basketball',
    name: 'Basketball',
    tagline: '30 seconds. Rapid fire. Drain it.',
    href: '/play/basketball',
  },
  {
    slug: 'free-kicks',
    name: 'Free Kicks',
    tagline: 'Bend it past the wall.',
    href: '/play/free-kicks',
  },
  {
    slug: 'solshot',
    name: 'SolShot',
    tagline: 'Artillery on Solana →',
    href: '/play/solshot',
  },
];

export function Dashboard() {
  const auth = useArcadeAuth();

  return (
    <main style={{ padding: 'var(--space-8)', maxWidth: 1200, margin: '0 auto' }}>
      <header style={{ marginBottom: 'var(--space-8)' }}>
        <h1
          style={{
            fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
            background: 'var(--fire-gradient)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {auth.callsign ? `Welcome back, ${auth.callsign}` : 'The Arcade'}
        </h1>
      </header>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 'var(--space-6)',
        }}
      >
        {GAMES.map((game) => (
          <Link
            key={game.slug}
            to={game.href}
            style={{
              display: 'block',
              padding: 'var(--space-6)',
              background: 'rgba(245, 230, 204, 0.04)',
              border: '2px solid var(--shadow-deep)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--fg)',
              textDecoration: 'none',
              transition: 'border-color 150ms ease, transform 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--shadow-deep)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.25rem',
                color: 'var(--accent)',
                marginBottom: 'var(--space-2)',
              }}
            >
              {game.name}
            </h2>
            <p style={{ margin: 0, opacity: 0.8 }}>{game.tagline}</p>
          </Link>
        ))}
      </section>

      <footer style={{ marginTop: 'var(--space-12)', opacity: 0.5, fontSize: '0.875rem' }}>
        Scaffold placeholder · real dashboard art and leaderboard rail by Fish.
      </footer>
    </main>
  );
}
