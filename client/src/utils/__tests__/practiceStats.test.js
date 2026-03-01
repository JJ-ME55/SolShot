import { getPracticeStats, updatePracticeStats } from '../practiceStats';

// Mock localStorage
const store = {};
beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
  // Seed solshot_uid so stats are keyed by user
  store['solshot_uid'] = 'test-uid-123';
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(k => store[k] || null);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => { store[k] = v; });
});
afterEach(() => jest.restoreAllMocks());

describe('getPracticeStats', () => {
  test('returns empty stats when nothing stored', () => {
    const s = getPracticeStats();
    expect(s.matchesPlayed).toBe(0);
    expect(s.wins).toBe(0);
    expect(s.losses).toBe(0);
    expect(s.kills).toBe(0);
    expect(s.deaths).toBe(0);
    expect(s.damageDealt).toBe(0);
    expect(s.lastMatchAt).toBeNull();
  });

  test('returns parsed stats when stored', () => {
    store['solshot_stats_test-uid-123'] = JSON.stringify({ matchesPlayed: 5, wins: 3, losses: 2, kills: 10, deaths: 5, damageDealt: 2000, lastMatchAt: '2026-01-01' });
    const s = getPracticeStats();
    expect(s.matchesPlayed).toBe(5);
    expect(s.wins).toBe(3);
    expect(s.kills).toBe(10);
  });

  test('returns empty stats on corrupt JSON', () => {
    store['solshot_stats_test-uid-123'] = 'not json';
    const s = getPracticeStats();
    expect(s.matchesPlayed).toBe(0);
  });

  test('falls back to solshot_stats key when no uid', () => {
    delete store['solshot_uid'];
    store['solshot_stats'] = JSON.stringify({ matchesPlayed: 7, wins: 4, losses: 3, kills: 0, deaths: 0, damageDealt: 0, lastMatchAt: null });
    const s = getPracticeStats();
    expect(s.matchesPlayed).toBe(7);
  });
});

describe('updatePracticeStats', () => {
  test('increments matchesPlayed on win', () => {
    const s = updatePracticeStats({ outcome: 'win', kills: 2, deaths: 0, damageDealt: 150 });
    expect(s.matchesPlayed).toBe(1);
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(0);
    expect(s.kills).toBe(2);
    expect(s.deaths).toBe(0);
    expect(s.damageDealt).toBe(150);
    expect(s.lastMatchAt).toBeTruthy();
  });

  test('increments matchesPlayed on loss', () => {
    const s = updatePracticeStats({ outcome: 'loss', kills: 0, deaths: 1, damageDealt: 80 });
    expect(s.matchesPlayed).toBe(1);
    expect(s.losses).toBe(1);
    expect(s.wins).toBe(0);
  });

  test('accumulates across multiple matches', () => {
    updatePracticeStats({ outcome: 'win', kills: 3, deaths: 1, damageDealt: 200 });
    updatePracticeStats({ outcome: 'loss', kills: 1, deaths: 2, damageDealt: 100 });
    const s = updatePracticeStats({ outcome: 'win', kills: 2, deaths: 0, damageDealt: 150 });
    expect(s.matchesPlayed).toBe(3);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.kills).toBe(6);
    expect(s.deaths).toBe(3);
    expect(s.damageDealt).toBe(450);
  });

  test('persists to uid-keyed localStorage', () => {
    updatePracticeStats({ outcome: 'win', kills: 1, deaths: 0, damageDealt: 50 });
    expect(store['solshot_stats_test-uid-123']).toBeTruthy();
    const parsed = JSON.parse(store['solshot_stats_test-uid-123']);
    expect(parsed.wins).toBe(1);
  });

  test('defaults kills/deaths/damage to 0 when not provided', () => {
    const s = updatePracticeStats({ outcome: 'win' });
    expect(s.kills).toBe(0);
    expect(s.deaths).toBe(0);
    expect(s.damageDealt).toBe(0);
  });
});
