/**
 * MyGamesScreen — multi-match home for group-chat mode.
 *
 * Lists every non-terminal group match the user is currently in across
 * all chats. Server-side `getMyGroupMatches` socket handler does the
 * lookup keyed on telegramUserId; this screen just renders the list +
 * provides one-tap routing to each match's detail screen.
 *
 * Reachable via:
 *   - /mygames bot command → ?startapp=mygames deep link
 *   - eventual Mini App home button (TBD)
 *
 * Renders 4 states:
 *   - loading
 *   - error (no identity / server error)
 *   - empty (user not in any active matches — pitch /customgame)
 *   - list (one card per match, tap to open GroupMatchScreen)
 */

import React, { useState, useEffect } from 'react';
import { useTelegram } from '../telegram/TelegramContext';
import { useSolShotWallet } from '../wallet/WalletContext';
import { haptic } from '../telegram/haptic';
import { EmptyState, ErrorState, SkeletonRow } from '../components/EmptyStates';

function formatTimeLeft(date) {
    if (!date) return '—';
    const ms = new Date(date).getTime() - Date.now();
    if (ms <= 0) return 'EXPIRED';
    const totalMin = Math.floor(ms / 60000);
    const days = Math.floor(totalMin / (60 * 24));
    const hours = Math.floor((totalMin % (60 * 24)) / 60);
    const mins = totalMin % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function stateLabel(state) {
    return {
        lobby: 'WAITING',
        active: 'IN PROGRESS',
        settled: 'COMPLETE',
        cancelled: 'CANCELLED',
    }[state] || state.toUpperCase();
}

function stateColor(state) {
    return {
        lobby: 'var(--olive)',
        active: 'var(--accent)',
        settled: 'var(--bone)',
        cancelled: 'var(--muted)',
    }[state] || 'var(--bone)';
}

export default function MyGamesScreen({ navigate }) {
    const { user: tgUser, isTelegram } = useTelegram();
    const { walletHandle } = useSolShotWallet();
    // Server-resolved TG id (preferred — set after auth via walletHandle
    // event). Falls back to TG WebApp's tgUser.id only if a Mini App
    // context ever populates it. Without this, regular-browser users
    // see no matches in their list because tgUser.id is undefined.
    const myTgId = walletHandle?.telegramUserId || tgUser?.id || null;
    const [matches, setMatches] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    const refresh = () => {
        if (!window.socket) return;
        setLoading(true);
        window.socket.emit('getMyGroupMatches');
    };

    useEffect(() => {
        if (!window.socket) {
            setError('No connection. Try refreshing.');
            setLoading(false);
            return;
        }
        const handler = (payload) => {
            setLoading(false);
            if (payload?.error) {
                setError(payload.error === 'no_identity'
                    ? 'No Telegram identity. Open via the bot link.'
                    : 'Couldn\'t load your matches.');
                setMatches([]);
                return;
            }
            setMatches(payload?.matches || []);
            setError(null);
        };
        window.socket.on('myGroupMatches', handler);
        window.socket.emit('getMyGroupMatches');
        return () => window.socket.off('myGroupMatches', handler);
    }, []);

    const openMatch = (matchId) => {
        haptic.tap();
        // navigate(screen, screenData) — App.js's navigate accepts a 2nd
        // arg that gets spread into screenData state. GroupMatchScreen
        // reads screenData.groupMatchId on mount + when matchId changes.
        navigate('group-match', { groupMatchId: matchId });
    };

    return (
        <div style={styles.fullPage}>
            <div style={styles.header}>
                <button style={styles.backBtn} onClick={() => { haptic.tap(); navigate('menu'); }}>←</button>
                <div style={styles.headerCenter}>
                    <div style={styles.title}>MY GROUP MATCHES</div>
                    <div style={styles.subtitle}>{matches ? `${matches.length} active` : '—'}</div>
                </div>
                <button style={styles.backBtn} onClick={refresh}>↻</button>
            </div>

            {/* Loading: skeleton rows match real card footprint so layout
                doesn't pop when data lands */}
            {loading && (
                <div style={styles.list}>
                    {Array.from({ length: 5 }).map((_, i) => (
                        <SkeletonRow key={i} height={70} lines={2} leftAccent />
                    ))}
                </div>
            )}

            {/* Error: TRANSMISSION FAILURE chassis with RETRY default */}
            {!loading && error && (
                <div style={styles.stateContainer}>
                    <ErrorState
                        icon="txfail"
                        title="LINK SEVERED"
                        body={isTelegram
                            ? 'MATCH FEED UNAVAILABLE. CHECK YOUR CONNECTION.'
                            : 'GROUP MATCHES ONLY WORK VIA TELEGRAM MINI APP.'}
                        primaryCTA={{ label: 'RETRY', onClick: refresh }}
                        secondaryCTA={{ label: 'BACK TO MENU', onClick: () => navigate('menu') }}
                    />
                </div>
            )}

            {/* Empty: no active matches → pitch /customgame */}
            {!loading && !error && matches && matches.length === 0 && (
                <div style={styles.stateContainer}>
                    <EmptyState
                        icon="radar"
                        title="NO CONTACT ON RADAR"
                        body="NO ACTIVE GROUP-CHAT MATCHES. RUN /CUSTOMGAME IN A TG GROUP TO START ONE."
                        primaryCTA={{ label: 'FIND MATCH', onClick: () => navigate('menu') }}
                    />
                </div>
            )}

            {!loading && !error && matches && matches.length > 0 && (
                <div style={styles.list}>
                    {matches.map(m => (
                        <MatchCard key={m.matchId} match={m} myTgId={myTgId} onOpen={() => openMatch(m.matchId)} />
                    ))}
                </div>
            )}
        </div>
    );
}

function MatchCard({ match, myTgId, onOpen }) {
    const { matchId, state, chatTitle, players = [], config = {}, currentPlayerIndex } = match;
    const myPlayer = players.find(p => p.telegramUserId === myTgId);
    const isMyTurn = state === 'active' && players[currentPlayerIndex]?.telegramUserId === myTgId;
    const aliveCount = state === 'active' ? players.filter(p => !p.eliminated).length : players.length;
    const expiresAt = state === 'lobby' ? match.lobbyExpiresAt : match.endsAt;

    return (
        <div onClick={onOpen} style={{
            ...styles.card,
            ...(isMyTurn ? styles.cardMyTurn : {}),
        }}>
            <div style={styles.cardHeader}>
                <div style={styles.cardTitle}>MATCH #{matchId}</div>
                <div style={{ ...styles.cardState, color: stateColor(state) }}>
                    {isMyTurn ? '🎯 YOUR TURN' : stateLabel(state)}
                </div>
            </div>
            {chatTitle && (
                <div style={styles.cardChat}>{chatTitle}</div>
            )}
            <div style={styles.cardMeta}>
                <span>{aliveCount}/{config.maxPlayers || players.length} alive</span>
                <span>·</span>
                <span>HP {myPlayer?.hp ?? '—'}</span>
                {expiresAt && (
                    <>
                        <span>·</span>
                        <span>{formatTimeLeft(expiresAt)} left</span>
                    </>
                )}
            </div>
        </div>
    );
}

const styles = {
    fullPage: {
        // flex:1 + overflowY:auto inside Layout's overflow:hidden viewport.
        // Match list can grow long; need internal scroll, not viewport scroll.
        flex: 1,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        background: 'var(--bg-deep)',
        display: 'flex', flexDirection: 'column',
        padding: 'clamp(12px, 3vw, 18px)',
        paddingBottom: 60,
    },
    header: {
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 16,
    },
    headerCenter: { flex: 1, textAlign: 'center' },
    title: {
        fontFamily: 'var(--f-display)', fontSize: 'clamp(15px, 4vw, 18px)',
        color: 'var(--bone)', letterSpacing: '0.12em',
    },
    subtitle: {
        fontFamily: 'var(--f-mono)', fontSize: 10,
        color: 'var(--olive)', letterSpacing: '0.22em', marginTop: 2,
    },
    backBtn: {
        padding: '8px 12px',
        background: 'var(--bg-surface)', color: 'var(--bone)',
        border: '1px solid var(--border)', clipPath: 'var(--clip-6)',
        fontFamily: 'var(--f-mono)', fontSize: 14, cursor: 'pointer',
    },
    list: {
        display: 'flex', flexDirection: 'column', gap: 10,
    },
    // Container for EmptyState / ErrorState — they self-position via
    // `position: absolute, inset: 0` so we need a relative parent with
    // a real height. flex:1 on the parent fullPage takes care of height.
    stateContainer: {
        position: 'relative',
        flex: 1,
        minHeight: 320,
    },
    card: {
        padding: '14px 16px',
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        clipPath: 'var(--clip-10)',
        cursor: 'pointer',
        transition: 'background 120ms',
    },
    cardMyTurn: {
        border: '1px solid var(--accent)',
        boxShadow: '0 0 12px rgba(218,138,40,0.25)',
    },
    cardHeader: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 6,
    },
    cardTitle: {
        fontFamily: 'var(--f-display)', fontSize: 14, color: 'var(--bone)',
        letterSpacing: '0.12em',
    },
    cardState: {
        fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.22em',
    },
    cardChat: {
        fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--olive)',
        letterSpacing: '0.06em', marginBottom: 8, lineHeight: 1.3,
    },
    cardMeta: {
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--muted)',
        letterSpacing: '0.12em',
    },
    empty: {
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 20,
    },
    emptyTitle: {
        fontFamily: 'var(--f-display)', fontSize: 14, color: 'var(--olive)',
        letterSpacing: '0.18em', marginBottom: 12, textAlign: 'center',
    },
    emptyHint: {
        fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--muted)',
        letterSpacing: '0.06em', lineHeight: 1.5, textAlign: 'center',
        maxWidth: 320,
    },
    errorMsg: {
        fontFamily: 'var(--f-display)', fontSize: 13, color: 'var(--red)',
        letterSpacing: '0.12em', marginBottom: 8, textAlign: 'center',
    },
    errorHint: {
        fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--olive)',
        letterSpacing: '0.06em', lineHeight: 1.4, textAlign: 'center',
        maxWidth: 280,
    },
};
