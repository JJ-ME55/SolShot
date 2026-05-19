/**
 * API client for the SolShot server.
 *
 * Server lives in the SolShot repo (`server/`); reachable at
 * VITE_SOLSHOT_API_BASE. All arcade endpoints are under
 * `/api/arcade/*` and are gated by the existing Privy auth middleware
 * (`requirePrivyAuth`) where indicated.
 *
 * Access-token retrieval: Privy's `getAccessToken()` returns a
 * short-lived JWT signed by Privy. The SolShot server validates it
 * via the existing middleware. Endpoints that don't require auth
 * (leaderboard reads) skip the header.
 */

const API_BASE = import.meta.env.VITE_SOLSHOT_API_BASE;

if (!API_BASE && import.meta.env.PROD) {
  // eslint-disable-next-line no-console
  console.error('[api] VITE_SOLSHOT_API_BASE is not set — API calls will fail.');
}

interface RequestOptions extends RequestInit {
  auth?: () => Promise<string | null>;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth, headers, ...rest } = options;
  const finalHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (auth) {
    const token = await auth();
    if (token) {
      (finalHeaders as Record<string, string>).Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: finalHeaders,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }

  return response.json() as Promise<T>;
}

export type LeaderboardWindow = 'today' | 'week' | 'all';

export interface LeaderboardEntry {
  rank: number;
  callsign: string;
  score: number;
  postedAt: string;
}

/** GET /api/arcade/leaderboard/:game?window=today|week|all */
export function fetchLeaderboard(game: string, window: LeaderboardWindow = 'all') {
  return apiFetch<{ entries: LeaderboardEntry[] }>(
    `/api/arcade/leaderboard/${game}?window=${window}`
  );
}

/** GET /api/arcade/leaderboard/champion?window=today|week|all */
export function fetchChampionLeaderboard(window: LeaderboardWindow = 'all') {
  return apiFetch<{ entries: LeaderboardEntry[] }>(
    `/api/arcade/leaderboard/champion?window=${window}`
  );
}

/** GET /api/arcade/profile/:callsign */
export function fetchProfile(callsign: string) {
  return apiFetch<{ callsign: string; stats: Record<string, unknown> }>(
    `/api/arcade/profile/${encodeURIComponent(callsign)}`
  );
}

/** POST /api/arcade/score — auth-gated */
export function submitScore(
  game: string,
  score: number,
  attemptId: string,
  getAccessToken: () => Promise<string | null>
) {
  return apiFetch<{ accepted: boolean; rank: number | null }>('/api/arcade/score', {
    method: 'POST',
    body: JSON.stringify({ game, score, attemptId }),
    auth: getAccessToken,
  });
}

/** GET /api/arcade/session-handoff — mints 10-min single-use JWT for solshot.gg redirect */
export function mintSolShotSessionToken(getAccessToken: () => Promise<string | null>) {
  return apiFetch<{ token: string; expiresAt: string }>('/api/arcade/session-handoff', {
    auth: getAccessToken,
  });
}

/** POST /api/wager-waitlist — public, rate-limited */
export function joinWagerWaitlist(email: string, callsign: string | null) {
  return apiFetch<{ ok: boolean }>('/api/wager-waitlist', {
    method: 'POST',
    body: JSON.stringify({ email, callsign, source: 'thearcade.web' }),
  });
}
