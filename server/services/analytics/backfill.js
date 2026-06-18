// Read-only historical gameplay aggregates for the arcade-analytics dashboard.
//
// Served at GET /api/admin/stats-aggregate (requireAdminKey). Called
// server-to-server by the dashboard with the x-admin-key header — so there's
// no CORS surface and no need to expose Mongo directly.
//
// Two shapes are returned per game:
//   games[slug]    — all-time totals (plays, players, first/last activity)
//   timelines[slug]— real per-DAY play counts, ONLY for games that store one
//                    document per match/race (critter-kart, shootout, pool,
//                    marathon). The single-score games (basketball, keepie,
//                    free-kicks, rug-run) keep one best-score doc per user, so
//                    only their all-time aggregate is historically knowable.

// Models use the codebase's dynamic-import pattern (see index.js race routes).
function model(name) {
  return import(`../../models/${name}.js`).then((m) => m.default);
}

// Per-day bucket pipeline over a per-event collection's timestamp field.
function dayBuckets(tsField) {
  return [
    { $match: { [tsField]: { $ne: null } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: `$${tsField}` } },
        plays: { $sum: 1 },
      },
    },
    { $project: { _id: 0, date: '$_id', plays: 1 } },
    { $sort: { date: 1 } },
  ];
}

// Aggregate a per-user collection (one doc per player).
//   playsField   — counter to SUM for total plays (else doc count)
//   firstField/lastField — activity-window timestamps (optional)
async function aggUsers(Model, { playsField, firstField, lastField } = {}) {
  const group = {
    _id: null,
    players: { $sum: 1 },
    plays: playsField ? { $sum: `$${playsField}` } : { $sum: 1 },
  };
  if (firstField) group.firstActivity = { $min: `$${firstField}` };
  if (lastField) group.lastActivity = { $max: `$${lastField}` };
  const [row] = await Model.aggregate([{ $group: group }]);
  return {
    plays: row?.plays || 0,
    players: row?.players || 0,
    firstActivity: row?.firstActivity || null,
    lastActivity: row?.lastActivity || null,
  };
}

// Aggregate a per-run collection (many docs per player) — plays = doc count,
// players = distinct identity.
async function aggRuns(Model, { idField = 'telegramUserId', firstField, lastField } = {}) {
  const group = {
    _id: null,
    plays: { $sum: 1 },
    playerSet: { $addToSet: `$${idField}` },
  };
  if (firstField) group.firstActivity = { $min: `$${firstField}` };
  if (lastField) group.lastActivity = { $max: `$${lastField}` };
  const [row] = await Model.aggregate([{ $group: group }]);
  return {
    plays: row?.plays || 0,
    players: row ? (row.playerSet || []).filter((x) => x != null).length : 0,
    firstActivity: row?.firstActivity || null,
    lastActivity: row?.lastActivity || null,
  };
}

export async function buildBackfill() {
  const [
    BasketballScore, KeepieUppiesScore, FreeKicksScore, RugRunScore,
    ShootoutStats, CritterKartCareer, PoolElo, MarathonRun,
    CritterKartRace, ShootoutMatch, PoolMatch, User,
  ] = await Promise.all([
    model('BasketballScore'), model('KeepieUppiesScore'), model('FreeKicksScore'), model('RugRunScore'),
    model('ShootoutStats'), model('CritterKartCareer'), model('PoolElo'), model('MarathonRun'),
    model('CritterKartRace'), model('ShootoutMatch'), model('PoolMatch'), model('User'),
  ]);

  const games = {};
  // Single-score games — all-time aggregate only (no per-play history exists).
  games['basketball'] = { ...(await aggUsers(BasketballScore, { playsField: 'totalSubmissions', firstField: 'firstSubmittedAt', lastField: 'lastSubmittedAt' })), granularity: 'aggregate' };
  games['keepie-uppies'] = { ...(await aggUsers(KeepieUppiesScore, { playsField: 'totalSubmissions', firstField: 'firstSubmittedAt', lastField: 'lastSubmittedAt' })), granularity: 'aggregate' };
  games['free-kicks'] = { ...(await aggUsers(FreeKicksScore, { playsField: 'totalSubmissions', firstField: 'firstSubmittedAt', lastField: 'lastSubmittedAt' })), granularity: 'aggregate' };
  games['rug-run'] = { ...(await aggUsers(RugRunScore, { playsField: 'totalSubmissions', firstField: 'firstSubmittedAt', lastField: 'lastSubmittedAt' })), granularity: 'aggregate' };
  // Match/race games — all-time aggregate from career docs + real daily timeline below.
  games['shootout'] = { ...(await aggUsers(ShootoutStats, { playsField: 'totalMatches', lastField: 'lastPlayedAt' })), granularity: 'daily' };
  games['critter-kart'] = { ...(await aggUsers(CritterKartCareer, { playsField: 'races', firstField: 'firstRaceAt', lastField: 'lastRaceAt' })), granularity: 'daily' };
  games['pool'] = { ...(await aggUsers(PoolElo, { playsField: 'matchCount', lastField: 'lastActiveAt' })), granularity: 'daily' };
  games['marathon'] = { ...(await aggRuns(MarathonRun, { firstField: 'startedAt', lastField: 'startedAt' })), granularity: 'daily' };
  // SolShot 1v1 artillery — career stats live on the User collection
  // (stats.matchesPlayed), with a per-match playedAt array for a daily timeline.
  const [solshotAgg] = await User.aggregate([
    {
      $group: {
        _id: null,
        plays: { $sum: { $ifNull: ['$stats.matchesPlayed', 0] } },
        players: { $sum: { $cond: [{ $gt: ['$stats.matchesPlayed', 0] }, 1, 0] } },
        firstActivity: { $min: '$createdAt' },
        lastActivity: { $max: '$lastActive' },
      },
    },
  ]);
  games['solshot'] = {
    plays: solshotAgg?.plays || 0,
    players: solshotAgg?.players || 0,
    firstActivity: solshotAgg?.firstActivity || null,
    lastActivity: solshotAgg?.lastActivity || null,
    granularity: 'daily',
  };

  // Real per-day timelines (one doc/sub-doc per match/race).
  const [ckTl, soTl, poolTl, marTl, solshotTl] = await Promise.all([
    CritterKartRace.aggregate(dayBuckets('createdAt')),
    ShootoutMatch.aggregate(dayBuckets('startedAt')),
    PoolMatch.aggregate(dayBuckets('startedAt')),
    MarathonRun.aggregate(dayBuckets('startedAt')),
    User.aggregate([
      { $unwind: '$matchHistory' },
      { $match: { 'matchHistory.playedAt': { $ne: null } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$matchHistory.playedAt' } }, plays: { $sum: 1 } } },
      { $project: { _id: 0, date: '$_id', plays: 1 } },
      { $sort: { date: 1 } },
    ]),
  ]);
  const timelines = {
    'critter-kart': ckTl,
    shootout: soTl,
    pool: poolTl,
    marathon: marTl,
    solshot: solshotTl,
  };

  return { generatedAt: new Date(), games, timelines };
}
