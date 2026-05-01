/**
 * GroupMatchScreen — view a single group-chat match.
 *
 * Reachable via deep link:
 *   ?startapp=lobby_<matchId>  → match in lobby state (used after wagered Join tap)
 *   ?startapp=match_<matchId>  → match active or settled
 *
 * Phase 1c scope: read-only display.
 *   - Lobby state:  show roster, host, config, "waiting for host to start"
 *   - Active state: show roster with HP bars, current player, time remaining
 *   - Settled:      show ranked finishers
 *
 * Phase 1d-real (TODO): aim + fire UI when state==='active' and it's
 * the viewer's turn. Will hook into the existing Phaser scene.
 */

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useTelegram } from '../telegram/TelegramContext';
import BattlefieldPreview from '../components/BattlefieldPreview';
import ShopScreen from './ShopScreen';

// Lazy-load the Phaser wrapper — pulls in MainScene + Phaser, ~1MB bundle.
// Only loaded when a player has an active match they're watching.
const GroupBattleWrapper = lazy(() => import('./GroupBattleWrapper'));

const SOL_PER_LAMPORT = 1_000_000_000;

function formatWager(config) {
    if (!config || config.type === 'free' || !config.wagerLamports) return 'FREE';
    const sol = config.wagerLamports / SOL_PER_LAMPORT;
    const str = sol.toFixed(4).replace(/\.?0+$/, '');
    return `${str || '0'} SOL`;
}

function formatDuration(ms) {
    if (!ms) return '?';
    const hours = ms / (60 * 60 * 1000);
    if (hours < 24) return `${hours}h`;
    return `${hours / 24}d`;
}

function formatTimeLeft(date) {
    if (!date) return '—';
    const ms = new Date(date).getTime() - Date.now();
    if (ms <= 0) return 'expired';
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / (60 * 24));
    const hours = Math.floor((totalMin % (60 * 24)) / 60);
    const mins = totalMin % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

/** Relative formatter for past timestamps. Returns "5m", "2h 14m", "3d 1h". */
function formatTimeAgo(date) {
    if (!date) return '—';
    const ms = Date.now() - new Date(date).getTime();
    if (ms < 0) return 'just now';
    const totalMin = Math.floor(ms / 60000);
    if (totalMin < 1) return 'just now';
    const days = Math.floor(totalMin / (60 * 24));
    const hours = Math.floor((totalMin % (60 * 24)) / 60);
    const mins = totalMin % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

export default function GroupMatchScreen({ navigate, screenData = {} }) {
    const { user: tgUser } = useTelegram();
    const [match, setMatch] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [firing, setFiring] = useState(false);
    const [fireError, setFireError] = useState(null);
    // Aim state lifted from FireControls so BattlefieldPreview can render
    // a live trajectory predictor on every slider change.
    const [aim, setAim] = useState({ angle: 45, power: 60 });

    const matchId = screenData.groupMatchId;

    // Fetch match on mount + when matchId changes
    useEffect(() => {
        if (!matchId || !window.socket) {
            setError('No match ID. Open this screen from a group-chat link.');
            setLoading(false);
            return;
        }

        const handler = (payload) => {
            setLoading(false);
            if (payload?.error) {
                setError(payload.error === 'not_found'
                    ? `Match ${matchId} no longer exists.`
                    : 'Couldn\'t load match.');
                return;
            }
            if (payload?.match?.matchId === matchId) {
                setMatch(payload.match);
                setError(null);
            }
        };
        window.socket.on('groupMatchData', handler);
        window.socket.emit('getGroupMatch', { matchId });
        return () => {
            window.socket.off('groupMatchData', handler);
        };
    }, [matchId]);

    const refresh = () => {
        if (!matchId || !window.socket) return;
        setLoading(true);
        window.socket.emit('getGroupMatch', { matchId });
    };

    // Listen for shot results (response to a fireGroupShot we sent).
    useEffect(() => {
        if (!window.socket) return;
        const handler = (payload) => {
            setFiring(false);
            if (!payload?.ok) {
                const errMap = {
                    not_your_turn: "It's not your turn.",
                    eliminated: 'You\'ve been eliminated.',
                    match_not_active: 'Match is no longer active.',
                    not_a_player: 'You\'re not a player in this match.',
                    bad_angle: 'Invalid angle.',
                    unknown_weapon: 'Unknown weapon.',
                    weapon_not_owned: 'You don\'t own that weapon.',
                    no_identity: 'No Telegram identity. Reopen via the bot link.',
                };
                setFireError(errMap[payload?.error] || 'Shot failed.');
                return;
            }
            setFireError(null);
            if (payload.match) setMatch(payload.match);
        };
        window.socket.on('shotResult', handler);
        return () => window.socket.off('shotResult', handler);
    }, []);

    const fireShot = ({ angle, power, weaponId }) => {
        if (!matchId || !window.socket) return;
        setFiring(true);
        setFireError(null);
        window.socket.emit('fireGroupShot', { matchId, angle, power, weaponId });
    };

    if (loading) {
        return (
            <div style={styles.fullPage}>
                <div style={styles.loading}>LOADING MATCH…</div>
            </div>
        );
    }
    if (error) {
        return (
            <div style={styles.fullPage}>
                <div style={styles.error}>{error}</div>
                <button style={styles.backBtn} onClick={() => navigate('menu')}>← Menu</button>
            </div>
        );
    }
    if (!match) return null;

    const myTgId = tgUser?.id;
    const myPlayer = match.players?.find(p => p.telegramUserId === myTgId);
    const isMyTurn = match.state === 'active'
        && match.players?.[match.currentPlayerIndex]?.telegramUserId === myTgId;

    // ACTIVE + viewer is a player → InGameHUD pattern from the redesign:
    // fixed-height top player bar, flex battlefield, compact bottom strip.
    // No scrolling — the whole HUD fits within the viewport.
    //
    // ACTIVE + spectator → SVG preview + slider UI in the scrollable layout.
    // LOBBY/SETTLED/CANCELLED → scrollable layout with full config + roster.
    const useFullScene = match.state === 'active' && !!myPlayer;

    // Pre-battle shop gate: active match + viewer is a player + hasn't
    // locked in their loadout yet → show the weapon shop. Mirrors the
    // 1v1 pre-battle flow: spend gold on weapons, lock in, then enter
    // the battle UI. After locking in, server flips player.shopComplete=true
    // and we re-render into the Phaser HUD below.
    const needsShop = useFullScene && !myPlayer.shopComplete;

    if (needsShop) {
        return (
            <ShopScreen
                navigate={navigate}
                screenData={{
                    gameMode: 'group-chat',
                    groupMatchId: matchId,
                    myTgId,
                    match,
                    onShopComplete: () => {
                        // Server has flipped shopComplete; refetch to re-render into HUD.
                        refresh();
                    },
                }}
            />
        );
    }

    if (useFullScene) {
        // Full-bleed Phaser canvas + BattleHUD overlay. The HUD (mounted
        // inside GroupBattleWrapper) owns the top player bar, weapon picker,
        // angle/power sliders, FIRE button, gold display, wind readout —
        // same component the 1v1 BattleScreen uses, so identical UX.
        return (
            <div style={styles.fullBleed}>
                <Suspense fallback={
                    <div style={styles.loadingFill}>LOADING BATTLEFIELD…</div>
                }>
                    <GroupBattleWrapper
                        match={match}
                        onMatchUpdate={setMatch}
                        fillMode
                        onLeaveMatch={() => navigate('menu')}
                    />
                </Suspense>
            </div>
        );
    }

    return (
        <div style={styles.fullPage}>
            <Header match={match} onMenu={() => navigate('menu')} onRefresh={refresh} />

            {/* Spectator preview — show the live battlefield ONLY for active
                matches the viewer isn't playing. For settled matches, the
                After Action Report below tells the story; the SVG would
                otherwise display the trajectory of the LAST shot (often a
                miss), reading like a misleading "winning strike". */}
            {match.state === 'active' && (
                <BattlefieldPreview match={match} myTgId={myTgId} aim={aim} />
            )}

            <ConfigSummary match={match} />
            <RosterSection match={match} myTgId={myTgId} />
            {match.state === 'lobby' && <LobbyFooter match={match} myPlayer={myPlayer} />}

            {/* Spectator view (active match but viewer not a player): slider UI
                so they can at least follow along. Players see the Phaser HUD. */}
            {match.state === 'active' && !useFullScene && (
                <ActiveFooter
                    match={match}
                    isMyTurn={isMyTurn}
                    onFire={fireShot}
                    firing={firing}
                    fireError={fireError}
                    onAimChange={setAim}
                />
            )}
            {match.state === 'settled' && <SettledFooter match={match} />}
        </div>
    );
}

// ─── Sub-components ─────────────────────────────────────────────────────
// Note: the in-match top player bar / status strip used to live here
// (ActivePlayerBar, ActiveStatusStrip, tankColorHex). They were retired
// when active-mode rendering moved to the full BattleHUD overlay
// (see GroupBattleWrapper) — same component the 1v1 BattleScreen uses,
// so the in-game UX is parity-matched. Spectator + lobby/settled views
// below are unchanged.

function Header({ match, onMenu, onRefresh }) {
    const stateLabel = {
        lobby: 'OPEN — WAITING FOR PLAYERS',
        active: 'IN PROGRESS',
        settled: 'COMPLETE',
        cancelled: 'CANCELLED',
    }[match.state] || match.state.toUpperCase();
    return (
        <div style={styles.header}>
            <button style={styles.backBtn} onClick={onMenu}>←</button>
            <div style={styles.headerCenter}>
                <div style={styles.matchId}>MATCH #{match.matchId}</div>
                <div style={styles.stateLabel}>{stateLabel}</div>
            </div>
            <button style={styles.backBtn} onClick={onRefresh}>↻</button>
        </div>
    );
}

function ConfigSummary({ match }) {
    const c = match.config || {};
    return (
        <div style={styles.configBlock}>
            <div style={styles.configRow}>
                <span style={styles.configLabel}>Wager</span>
                <span style={styles.configValue}>{formatWager(c)}</span>
            </div>
            <div style={styles.configRow}>
                <span style={styles.configLabel}>Players</span>
                <span style={styles.configValue}>{match.players?.length ?? 0} / {c.maxPlayers}</span>
            </div>
            <div style={styles.configRow}>
                <span style={styles.configLabel}>Duration</span>
                <span style={styles.configValue}>{formatDuration(c.durationMs)}</span>
            </div>
            <div style={styles.configRow}>
                <span style={styles.configLabel}>Turn timer</span>
                <span style={styles.configValue}>{formatDuration(c.turnTimerMs)}</span>
            </div>
            {c.buybacksEnabled && (
                <div style={styles.configRow}>
                    <span style={styles.configLabel}>Buybacks</span>
                    <span style={styles.configValue}>
                        {c.buybackCap === -1 ? 'unlimited' : `max ${c.buybackCap}`}
                    </span>
                </div>
            )}
        </div>
    );
}

function RosterSection({ match, myTgId }) {
    return (
        <div style={styles.rosterBlock}>
            <div style={styles.sectionTitle}>ROSTER</div>
            {match.players?.map((p, idx) => (
                <PlayerRow
                    key={p.telegramUserId || idx}
                    player={p}
                    index={idx}
                    isCurrent={match.state === 'active' && idx === match.currentPlayerIndex}
                    isMe={p.telegramUserId === myTgId}
                    matchState={match.state}
                />
            ))}
        </div>
    );
}

function PlayerRow({ player, index, isCurrent, isMe, matchState }) {
    const name = player.tgUsername ? `@${player.tgUsername}` : (player.callsign || 'unknown');
    // 250 max HP matches the 1v1 rebalance and the GroupMatch schema default.
    const HP_MAX = 250;
    const hpPct = Math.max(0, Math.min(100, (player.hp / HP_MAX) * 100));
    const hpColor = player.eliminated ? '#5a1e0a'
        : hpPct <= 30 ? '#a83a1f'
        : hpPct <= 60 ? '#c4a65d'
        : '#7a9060';
    return (
        <div style={{
            ...styles.playerRow,
            border: isCurrent ? '1px solid #ff7a1a' : '1px solid rgba(196,166,93,0.2)',
            opacity: player.eliminated ? 0.45 : 1,
        }}>
            <div style={styles.playerLeft}>
                <span style={styles.playerName}>
                    {name} {isMe && <span style={styles.youBadge}>YOU</span>}
                </span>
                {isCurrent && <span style={styles.turnBadge}>TURN</span>}
                {player.eliminated && <span style={styles.elimBadge}>OUT</span>}
            </div>
            {matchState !== 'lobby' && (
                <div style={styles.hpBar}>
                    <div style={{ ...styles.hpFill, width: `${hpPct}%`, background: hpColor }} />
                    <span style={styles.hpText}>{player.hp} / {HP_MAX} HP</span>
                </div>
            )}
        </div>
    );
}

function LobbyFooter({ match, myPlayer }) {
    return (
        <div style={styles.footerBlock}>
            <div style={styles.footerLine}>
                {myPlayer
                    ? "You're in — host will start the match shortly."
                    : "Open the lobby card in chat to join."}
            </div>
            <div style={styles.footerSub}>
                Lobby closes in {formatTimeLeft(match.lobbyExpiresAt)}.
            </div>
        </div>
    );
}

function ActiveFooter({ match, isMyTurn, onFire, firing, fireError, onAimChange }) {
    if (!isMyTurn) {
        const current = match.players?.[match.currentPlayerIndex];
        const currentName = current?.tgUsername ? `@${current.tgUsername}` : (current?.callsign || 'a player');
        return (
            <div style={styles.footerBlock}>
                <div style={styles.footerLine}>
                    Waiting on <b>{currentName}</b>. You'll get a chat ping when it's your move.
                </div>
                <div style={styles.footerSub}>
                    Match ends in {formatTimeLeft(match.endsAt)}.
                </div>
            </div>
        );
    }
    return <FireControls onFire={onFire} firing={firing} fireError={fireError} match={match} onAimChange={onAimChange} />;
}

function FireControls({ onFire, firing, fireError, match, onAimChange }) {
    const [angle, setAngleLocal] = useState(45);
    const [power, setPowerLocal] = useState(60);
    // v1: only Single Shot weapon (id 0). Phase 2 will add the shop.
    const weaponId = 0;

    // Keep parent's aim state in sync so BattlefieldPreview can render
    // a live trajectory arc from the firer's tank.
    const setAngle = (v) => {
        setAngleLocal(v);
        onAimChange?.({ angle: Number(v), power: Number(power) });
    };
    const setPower = (v) => {
        setPowerLocal(v);
        onAimChange?.({ angle: Number(angle), power: Number(v) });
    };

    const submit = () => {
        if (firing) return;
        onFire({ angle: Number(angle), power: Number(power), weaponId });
    };

    return (
        <div style={styles.footerBlock}>
            <div style={styles.footerLineHighlight}>🎯 Your turn — aim and fire</div>
            <div style={styles.fireGrid}>
                <label style={styles.fireLabel}>
                    <span>Angle</span>
                    <input
                        type="range"
                        min="0"
                        max="180"
                        value={angle}
                        onChange={(e) => setAngle(e.target.value)}
                        style={styles.fireSlider}
                    />
                    <span style={styles.fireValue}>{angle}°</span>
                </label>
                <label style={styles.fireLabel}>
                    <span>Power</span>
                    <input
                        type="range"
                        min="1"
                        max="100"
                        value={power}
                        onChange={(e) => setPower(e.target.value)}
                        style={styles.fireSlider}
                    />
                    <span style={styles.fireValue}>{power}</span>
                </label>
            </div>
            <button
                style={{ ...styles.fireBtn, opacity: firing ? 0.5 : 1, cursor: firing ? 'wait' : 'pointer' }}
                onClick={submit}
                disabled={firing}
            >
                {firing ? 'FIRING…' : 'FIRE'}
            </button>
            {fireError && <div style={styles.fireError}>{fireError}</div>}
            <div style={styles.footerSub}>
                Wind: {match.wind ?? 0} px/s² · Match ends in {formatTimeLeft(match.endsAt)}
            </div>
        </div>
    );
}

/**
 * After-Action Report — settled-state card mirroring the redesign aesthetic
 * (DOC stamp, "★ MATCH SETTLED ★", winner strip, podium, ranked finishers).
 * Replaces the prior 3-line summary + the misleading BattlefieldPreview
 * trajectory snapshot (which always showed the LAST shot — often a miss —
 * making it read as if that were the winning strike).
 */
function SettledFooter({ match }) {
    const ranked = match.rankedFinishers || [];
    const players = match.players || [];
    // Resolve in finishing order. Anyone not in rankedFinishers (shouldn't
    // happen post-settle, but defensive) is appended at the end.
    const finishersInOrder = ranked
        .map(tgId => players.find(p => p.telegramUserId === tgId))
        .filter(Boolean);
    const stragglers = players.filter(p => !ranked.includes(p.telegramUserId));
    const podium = [...finishersInOrder, ...stragglers];
    const winner = podium[0];

    // Match meta — try to pull from config + lifecycle timestamps.
    const cfg = match.config || {};
    const isFree = cfg.type === 'free' || !cfg.wagerLamports;
    const startedMs = match.startedAt ? new Date(match.startedAt).getTime() : null;
    const settledMs = match.settledAt ? new Date(match.settledAt).getTime() : null;
    const realDurationMin = (startedMs && settledMs)
        ? Math.max(1, Math.round((settledMs - startedMs) / 60000))
        : null;

    const callsignOf = (p) =>
        p?.tgUsername ? `@${p.tgUsername}` : (p?.callsign || 'unknown');
    const colorOf = (p) =>
        typeof p?.tankColor === 'number'
            ? '#' + p.tankColor.toString(16).padStart(6, '0')
            : '#c8a84a';

    return (
        <div style={aar.wrap}>
            {/* Stamp header */}
            <div style={aar.stampRow}>
                <span style={aar.stampSide}>DOC 14-C · DECLASSIFIED</span>
                <span style={aar.stampMain}>★ MATCH SETTLED ★</span>
                <span style={aar.stampSide}>M-#{match.matchId}</span>
            </div>

            <div style={aar.title}>AFTER ACTION REPORT</div>
            <div style={aar.subtitle}>
                {isFree ? 'FREE' : `${(cfg.wagerLamports / 1e9).toFixed(3)} SOL`}
                {' · '}
                {players.length}P FFA
                {realDurationMin != null ? ` · DURATION ${realDurationMin}m` : ''}
                {match.settledAt ? ` · ${formatTimeAgo(match.settledAt)} AGO` : ''}
            </div>

            {/* WINNER STRIP */}
            {winner && (
                <div style={aar.winnerStrip}>
                    <div style={aar.winnerW}>W</div>
                    <div style={aar.winnerInner}>
                        <div style={aar.winnerLabel}>VICTOR</div>
                        <div style={{ ...aar.winnerCallsign, color: colorOf(winner) }}>
                            {callsignOf(winner).toUpperCase()}
                        </div>
                        <div style={aar.winnerStats}>
                            HP {winner.hp ?? 0} / 250 · KILLS {winner.kills ?? 0} · DMG {winner.damageDealt ?? 0}
                        </div>
                    </div>
                </div>
            )}

            {/* RANKED FINISHERS */}
            <div style={aar.podiumLabel}>FINAL STANDINGS</div>
            <div style={aar.podiumList}>
                {podium.map((p, i) => {
                    const placement = i + 1;
                    const ord = placement === 1 ? '1ST' : placement === 2 ? '2ND' : placement === 3 ? '3RD' : `${placement}TH`;
                    return (
                        <div key={p.telegramUserId || i} style={{
                            ...aar.podiumRow,
                            opacity: p.eliminated ? 0.7 : 1,
                            borderLeft: `3px solid ${colorOf(p)}`,
                        }}>
                            <span style={aar.podiumOrd}>{ord}</span>
                            <span style={{ ...aar.podiumName, color: colorOf(p) }}>
                                {callsignOf(p).toUpperCase()}
                            </span>
                            <span style={aar.podiumStats}>
                                {p.kills ?? 0}K · {p.damageDealt ?? 0} DMG
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// AAR-card local styles. Kept inline + scoped here to avoid bloating the
// main `styles` object below; this card is only rendered for settled state.
const aar = {
    wrap: {
        margin: '12px 16px',
        padding: '18px 20px',
        background: 'var(--bg-surface, #141c0d)',
        border: '1px solid var(--border, rgba(196,166,93,0.25))',
        clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
    },
    stampRow: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 14,
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 9, letterSpacing: '0.2em', color: 'var(--olive, #c4a65d)',
    },
    stampSide: { opacity: 0.7 },
    stampMain: {
        color: 'var(--accent, #ff7a1a)',
        border: '2px solid var(--accent, #ff7a1a)',
        padding: '2px 10px',
        transform: 'rotate(-1.5deg)',
        fontFamily: "'Black Ops One', cursive",
        fontSize: 11,
        letterSpacing: '0.15em',
    },
    title: {
        fontFamily: "'Black Ops One', cursive",
        fontSize: 28, color: 'var(--bone, #f4e7c8)',
        letterSpacing: '0.05em', lineHeight: 1.1,
        marginBottom: 4,
    },
    subtitle: {
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 10, color: 'var(--olive, #c4a65d)',
        letterSpacing: '0.18em', marginBottom: 16,
    },
    winnerStrip: {
        background: 'var(--accent, #ff7a1a)',
        clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))',
        padding: '14px 18px',
        marginBottom: 18,
        display: 'flex', alignItems: 'center', gap: 18,
    },
    winnerW: {
        fontFamily: "'Black Ops One', cursive",
        fontSize: 56, color: '#0e1209', lineHeight: 0.8, flexShrink: 0,
    },
    winnerInner: { flex: 1, minWidth: 0 },
    winnerLabel: {
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 9, color: '#0e1209', letterSpacing: '0.3em', opacity: 0.7,
    },
    winnerCallsign: {
        fontFamily: "'Black Ops One', cursive",
        fontSize: 22,
        letterSpacing: '0.05em', lineHeight: 1.1,
        marginTop: 2,
        textShadow: '0 1px 0 rgba(0,0,0,0.2)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    },
    winnerStats: {
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 10, color: '#0e1209', letterSpacing: '0.18em',
        marginTop: 4, opacity: 0.85,
    },
    podiumLabel: {
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 10, color: 'var(--olive, #c4a65d)', letterSpacing: '0.22em',
        marginBottom: 8,
    },
    podiumList: {
        display: 'flex', flexDirection: 'column', gap: 6,
    },
    podiumRow: {
        display: 'grid',
        gridTemplateColumns: '46px 1fr auto',
        alignItems: 'center', gap: 12,
        padding: '8px 12px',
        background: 'var(--bg-deep, #0e1209)',
        border: '1px solid var(--border, rgba(196,166,93,0.15))',
    },
    podiumOrd: {
        fontFamily: "'Black Ops One', cursive",
        fontSize: 14, color: 'var(--bone, #f4e7c8)',
        letterSpacing: '0.1em',
    },
    podiumName: {
        fontFamily: "'Black Ops One', cursive",
        fontSize: 13, letterSpacing: '0.05em',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    },
    podiumStats: {
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 10, color: 'var(--olive, #c4a65d)',
        letterSpacing: '0.15em', whiteSpace: 'nowrap',
    },
};

// ─── Inline styles (matching the project's CRT-terminal aesthetic) ──────

const styles = {
    // Active-mode HUD — three fixed sections, fills viewport, NO scroll.
    // Mirrors the redesign's InGameHUD pattern (top player bar / battlefield /
    // bottom status strip).
    activePage: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-deep, #0e1209)',
        color: 'var(--bone-pale, #f4e7c8)',
        fontFamily: "'Space Grotesk', system-ui, sans-serif",
        overflow: 'hidden',
        minHeight: 0,
    },
    // Full-bleed Phaser canvas + BattleHUD overlay. The HUD itself
    // (mounted by GroupBattleWrapper) handles top player bar / weapon
    // picker / FIRE button / status strip — same component the 1v1
    // BattleScreen uses for parity.
    fullBleed: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-deep, #0e1209)',
        overflow: 'hidden',
        minHeight: 0,
    },
    battlefieldFill: {
        flex: 1,
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
    },
    loadingFill: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Share Tech Mono', monospace",
        letterSpacing: '0.3em',
        color: 'var(--olive, #c4a65d)',
        fontSize: 11,
    },
    // Top player bar — compact, fixed-height, single row.
    topBar: {
        flexShrink: 0,
        display: 'flex',
        alignItems: 'stretch',
        gap: 8,
        padding: '6px 8px',
        background: 'var(--bg-surface, #141c0d)',
        borderBottom: '1px solid var(--border, rgba(196,166,93,0.2))',
        minHeight: 56,
    },
    topBarBack: {
        background: 'transparent',
        border: '1px solid var(--border)',
        color: 'var(--bone)',
        padding: '0 12px',
        fontSize: 18,
        fontFamily: "'Share Tech Mono', monospace",
        cursor: 'pointer',
        flexShrink: 0,
    },
    topBarMatchInfo: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        flexShrink: 0,
        paddingRight: 8,
        borderRight: '1px solid var(--border)',
    },
    topBarMatchId: {
        fontFamily: "'Black Ops One', cursive",
        fontSize: 12,
        letterSpacing: '0.08em',
        color: 'var(--bone)',
    },
    topBarMeta: {
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 9,
        letterSpacing: '0.2em',
        color: 'var(--olive)',
        marginTop: 2,
    },
    topBarPlayers: {
        flex: 1,
        display: 'flex',
        gap: 4,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
    },
    topBarPlayerCard: {
        flex: '1 1 0',
        minWidth: 90,
        padding: '6px 8px',
        clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 4,
    },
    topBarRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 6,
    },
    topBarPlayerName: {
        fontFamily: "'Black Ops One', cursive",
        fontSize: 11,
        letterSpacing: '0.06em',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        flex: 1,
        minWidth: 0,
    },
    topBarYouTag: {
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 8,
        color: 'var(--muted)',
    },
    topBarTurnTag: {
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 10,
    },
    topBarHpBar: {
        height: 6,
        background: 'rgba(0,0,0,0.5)',
        border: '1px solid var(--border)',
        position: 'relative',
        overflow: 'hidden',
    },
    topBarHpFill: {
        height: '100%',
        transition: 'width 220ms ease-out',
    },
    topBarHpLabel: {
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 9,
        color: 'var(--olive)',
        letterSpacing: '0.15em',
        flexShrink: 0,
    },
    // Bottom status strip — compact, fixed-height
    statusStrip: {
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 14px',
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border)',
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 10,
        letterSpacing: '0.18em',
        color: 'var(--bone)',
        minHeight: 36,
    },
    statusItem: {
        flex: 1,
    },
    statusItemSecondary: {
        color: 'var(--olive)',
    },
    fullPage: {
        // flex:1 + overflowY:auto inside Layout's overflow:hidden viewport.
        // Used for lobby/settled states (long content, scrollable). Active
        // gameplay uses activePage (fixed layout, no scroll) instead.
        flex: 1,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        background: 'var(--bg-deep, #0e1209)',
        color: 'var(--bone-pale, #f4e7c8)',
        fontFamily: "'Space Grotesk', system-ui, sans-serif",
        padding: 20,
        paddingBottom: 80, // breathing room below the FIRE controls / ranked list
        boxSizing: 'border-box',
    },
    loading: {
        textAlign: 'center',
        padding: 80,
        fontFamily: "'Share Tech Mono', monospace",
        letterSpacing: '0.3em',
        color: 'var(--olive, #c4a65d)',
        fontSize: 12,
    },
    error: {
        textAlign: 'center',
        padding: 60,
        color: '#ff8862',
        fontSize: 14,
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
        paddingBottom: 14,
        borderBottom: '1px solid rgba(196,166,93,0.2)',
    },
    headerCenter: {
        textAlign: 'center',
        flex: 1,
    },
    matchId: {
        fontFamily: "'Black Ops One', sans-serif",
        fontSize: 22,
        letterSpacing: '0.04em',
        color: 'var(--bone, #fff8e8)',
    },
    stateLabel: {
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 10,
        letterSpacing: '0.3em',
        color: 'var(--accent, #ff7a1a)',
        marginTop: 4,
    },
    backBtn: {
        background: 'transparent',
        border: '1px solid rgba(196,166,93,0.4)',
        color: 'var(--bone-pale, #f4e7c8)',
        padding: '6px 12px',
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 14,
        cursor: 'pointer',
        minWidth: 36,
    },
    configBlock: {
        background: 'var(--bg-deeper, #0a0d07)',
        border: '1px solid rgba(196,166,93,0.2)',
        padding: '12px 16px',
        marginBottom: 20,
    },
    configRow: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '4px 0',
        fontSize: 13,
    },
    configLabel: {
        color: 'var(--olive, #c4a65d)',
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 11,
        letterSpacing: '0.2em',
    },
    configValue: {
        color: 'var(--bone, #fff8e8)',
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 13,
    },
    rosterBlock: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 11,
        letterSpacing: '0.4em',
        color: 'var(--accent, #ff7a1a)',
        marginBottom: 10,
    },
    playerRow: {
        background: 'var(--bg-deeper, #0a0d07)',
        padding: '10px 14px',
        marginBottom: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    playerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
    },
    playerName: {
        fontSize: 14,
        color: 'var(--bone, #fff8e8)',
    },
    youBadge: {
        fontSize: 9,
        letterSpacing: '0.2em',
        color: 'var(--accent, #ff7a1a)',
        background: 'rgba(255,122,26,0.1)',
        padding: '1px 6px',
        marginLeft: 4,
    },
    turnBadge: {
        fontSize: 9,
        letterSpacing: '0.25em',
        color: 'var(--accent, #ff7a1a)',
        background: 'rgba(255,122,26,0.15)',
        padding: '2px 8px',
    },
    elimBadge: {
        fontSize: 9,
        letterSpacing: '0.25em',
        color: '#ff8862',
        background: 'rgba(168,58,31,0.15)',
        padding: '2px 8px',
    },
    hpBar: {
        position: 'relative',
        height: 18,
        background: 'rgba(0,0,0,0.4)',
        border: '1px solid rgba(196,166,93,0.2)',
    },
    hpFill: {
        height: '100%',
        transition: 'width 0.3s ease',
    },
    hpText: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        textAlign: 'center',
        lineHeight: '18px',
        fontSize: 11,
        fontFamily: "'Share Tech Mono', monospace",
        letterSpacing: '0.1em',
        color: 'var(--bone, #fff8e8)',
        textShadow: '0 1px 2px rgba(0,0,0,0.6)',
    },
    footerBlock: {
        marginTop: 20,
        padding: 16,
        background: 'rgba(255,122,26,0.05)',
        border: '1px dashed rgba(255,122,26,0.3)',
    },
    footerLine: {
        fontSize: 13,
        color: 'var(--bone-pale, #f4e7c8)',
        marginBottom: 6,
    },
    footerLineHighlight: {
        fontFamily: "'Black Ops One', sans-serif",
        fontSize: 16,
        letterSpacing: '0.04em',
        color: 'var(--accent, #ff7a1a)',
        marginBottom: 6,
    },
    footerSub: {
        fontSize: 11,
        fontFamily: "'Share Tech Mono', monospace",
        letterSpacing: '0.2em',
        color: 'var(--olive, #c4a65d)',
        marginTop: 8,
    },
    fireGrid: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        margin: '12px 0 16px',
    },
    fireLabel: {
        display: 'grid',
        gridTemplateColumns: '60px 1fr 50px',
        alignItems: 'center',
        gap: 12,
        fontSize: 12,
        fontFamily: "'Share Tech Mono', monospace",
        letterSpacing: '0.2em',
        color: 'var(--olive, #c4a65d)',
    },
    fireSlider: {
        width: '100%',
        accentColor: 'var(--accent, #ff7a1a)',
    },
    fireValue: {
        textAlign: 'right',
        color: 'var(--bone, #fff8e8)',
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 14,
    },
    fireBtn: {
        width: '100%',
        padding: '14px 0',
        background: 'var(--accent, #ff7a1a)',
        color: 'var(--ink, #06080a)',
        border: 'none',
        fontFamily: "'Black Ops One', sans-serif",
        fontSize: 18,
        letterSpacing: '0.15em',
        cursor: 'pointer',
        marginBottom: 4,
    },
    fireError: {
        marginTop: 8,
        padding: '8px 12px',
        background: 'rgba(168,58,31,0.15)',
        border: '1px solid rgba(168,58,31,0.4)',
        color: '#ff8862',
        fontSize: 12,
    },
};
