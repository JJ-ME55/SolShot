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

    // For ACTIVE matches with the viewer as a player, mount the full Phaser
    // scene (same one that powers 1v1) — preserves all the painstakingly
    // tuned trajectory + blast + gravity quality. The slider FireControls
    // become unnecessary because Phaser's native turret aiming + power
    // controls take over.
    //
    // For SETTLED matches, lobbies, or spectators (chat members not in the
    // match), keep the lighter SVG preview — no need for a full Phaser
    // scene + 1MB bundle just to look at the final state.
    const useFullScene = match.state === 'active' && !!myPlayer;

    return (
        <div style={styles.fullPage}>
            <Header match={match} onMenu={() => navigate('menu')} onRefresh={refresh} />

            {useFullScene ? (
                <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--olive)', fontFamily: 'var(--f-mono)', letterSpacing: '0.3em', fontSize: 11 }}>LOADING BATTLEFIELD…</div>}>
                    <GroupBattleWrapper match={match} onMatchUpdate={setMatch} />
                </Suspense>
            ) : (
                (match.state === 'active' || match.state === 'settled') && (
                    <BattlefieldPreview match={match} myTgId={myTgId} aim={aim} />
                )
            )}

            <ConfigSummary match={match} />
            <RosterSection match={match} myTgId={myTgId} />
            {match.state === 'lobby' && <LobbyFooter match={match} myPlayer={myPlayer} />}

            {/* In active mode: only show slider FireControls when NOT using the full
                Phaser scene (i.e. spectator without a tank). Players using Phaser
                aim + fire from the canvas itself. */}
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
    const hpPct = Math.max(0, Math.min(100, (player.hp / 100) * 100));
    const hpColor = player.eliminated ? '#5a1e0a'
        : player.hp <= 30 ? '#a83a1f'
        : player.hp <= 60 ? '#c4a65d'
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
                    <span style={styles.hpText}>{player.hp} HP</span>
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

function SettledFooter({ match }) {
    const ranked = match.rankedFinishers || [];
    const firstId = ranked[0];
    const winner = match.players?.find(p => p.telegramUserId === firstId);
    return (
        <div style={styles.footerBlock}>
            <div style={styles.footerLineHighlight}>
                🏆 Winner: {winner?.tgUsername ? `@${winner.tgUsername}` : (winner?.callsign || 'unknown')}
            </div>
            <div style={styles.footerSub}>
                Settled {formatTimeLeft(match.settledAt)} ago.
            </div>
        </div>
    );
}

// ─── Inline styles (matching the project's CRT-terminal aesthetic) ──────

const styles = {
    fullPage: {
        // flex:1 + overflowY:auto inside Layout's overflow:hidden viewport.
        // Without this, content longer than the viewport gets clipped and
        // the page becomes unscrollable inside the TG WebApp.
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
