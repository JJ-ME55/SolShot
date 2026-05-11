/**
 * GroupDepositScreen — wagered group-chat match in 'awaiting_deposits' state.
 *
 * Reachable via deep link from the bot's deposit button:
 *   ?startapp=deposit_<matchId>
 *
 * Flow:
 *   1. Fetch the match via getGroupMatch
 *   2. If state !== 'awaiting_deposits' → bounce to group-match (lobby/active/settled)
 *   3. If viewer is not a player or has no linked wallet → error
 *   4. If viewer has already deposited (initialDepositTx set) → show "paid, waiting for others"
 *   5. Otherwise → "Deposit X SOL" button → request tx → sign → confirm
 *   6. On confirm:
 *        - If all deposited → navigate to 'group-match' (server flips state to active)
 *        - Else show updated roster with the deposit count
 *
 * Listens for `groupDepositStatus` broadcasts to live-update the roster
 * as other players pay.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTelegram } from '../telegram/TelegramContext';
import { useSolShotWallet } from '../wallet/WalletContext';

const SOL_PER_LAMPORT = 1_000_000_000;

function formatSOL(lamports) {
    if (!lamports) return '0';
    const sol = lamports / SOL_PER_LAMPORT;
    return sol.toFixed(4).replace(/\.?0+$/, '') || '0';
}

function formatPlayerLabel(p) {
    if (p.callsign) return p.callsign;
    if (p.tgUsername) return `@${p.tgUsername}`;
    return p.walletAddress ? `${p.walletAddress.slice(0, 4)}…${p.walletAddress.slice(-4)}` : 'unknown';
}

export default function GroupDepositScreen({ navigate, screenData = {} }) {
    const matchId = screenData.groupMatchId;
    const { user: tgUser } = useTelegram();
    const {
        walletAddress,
        balance,
        refreshBalance,
        signAndSendGroupDeposit,
        login,
        isAuthenticated,
        privyReady,
    } = useSolShotWallet();

    const [match, setMatch] = useState(null);
    const [depositRoster, setDepositRoster] = useState(null);    // [{ walletAddress, callsign, deposited }]
    const [phase, setPhase] = useState('loading');               // loading | ready | building | signing | confirming | done | error
    const [error, setError] = useState(null);
    const [txSignature, setTxSignature] = useState(null);

    // Guard against double-fire of the deposit handler
    const submitInProgress = useRef(false);

    // ── 1. Fetch match info on mount + listen for live deposit-status broadcasts
    useEffect(() => {
        if (!matchId) {
            setError('No match ID. Bad deep link.');
            setPhase('error');
            return;
        }
        const sock = window.socket;
        if (!sock) {
            setError('Not connected. Refresh and try again.');
            setPhase('error');
            return;
        }

        // Wait for the socket to authenticate before fetching the match. When
        // this screen is reached via deep link (Telegram bot deposit button or
        // direct URL), the screen mounts BEFORE the wallet-adapter has emitted
        // its `authenticate` handshake — so emitting `getGroupMatch` here would
        // race the H022 auth gate on the server and surface as
        // "DEPOSIT UNAVAILABLE / auth_required" until the user retried.
        // The render side already handles !privyReady / !walletAddress with
        // sign-in fall-through; this just defers the fetch until the socket is
        // actually authed, then re-runs when isAuthenticated flips true.
        if (!isAuthenticated) {
            return;
        }

        const onMatchData = (payload) => {
            if (payload?.matchId && payload.matchId !== matchId) return;
            if (payload?.error) {
                setError(`Match lookup failed: ${payload.error}`);
                setPhase('error');
                return;
            }
            const m = payload?.match;
            if (!m) {
                setError('Match not found.');
                setPhase('error');
                return;
            }
            setMatch(m);

            // Off-state bounces — the server may have advanced the match while
            // the player was opening this screen.
            if (m.state === 'lobby') {
                navigate('group-match', { groupMatchId: matchId });
                return;
            }
            if (m.state === 'active' || m.state === 'settled' || m.state === 'cancelled') {
                navigate('group-match', { groupMatchId: matchId });
                return;
            }

            setPhase('ready');
        };

        const onDepositStatus = (payload) => {
            if (payload?.matchId !== matchId) return;
            if (payload.deposits) {
                setDepositRoster(payload.deposits);
            }
            if (payload.state === 'active') {
                // Last deposit landed — match is now playable.
                navigate('group-match', { groupMatchId: matchId });
            }
        };

        sock.on('groupMatchData', onMatchData);
        sock.on('groupDepositStatus', onDepositStatus);

        sock.emit('getGroupMatch', { matchId });

        return () => {
            sock.off('groupMatchData', onMatchData);
            sock.off('groupDepositStatus', onDepositStatus);
        };
    }, [matchId, navigate, isAuthenticated]);

    // ── 2. Listen for our own deposit-confirm result
    useEffect(() => {
        const sock = window.socket;
        if (!sock) return;

        const onConfirm = (payload) => {
            if (payload?.matchId !== matchId) return;
            if (payload.error) {
                setError(`Deposit confirmation failed: ${payload.error}`);
                setPhase('error');
                return;
            }
            if (payload.allDeposited) {
                setPhase('done');
                // Brief pause on the success state before bouncing into the match.
                setTimeout(() => navigate('group-match', { groupMatchId: matchId }), 1200);
            } else {
                setPhase('done');
            }
        };

        sock.on('groupDepositConfirmed', onConfirm);
        return () => sock.off('groupDepositConfirmed', onConfirm);
    }, [matchId, navigate]);

    // ── 3. Derive the current player + viewer state
    const viewerPlayer = match?.players?.find(p => p.walletAddress && p.walletAddress === walletAddress);
    const viewerHasDeposited = !!viewerPlayer?.initialDepositTx;
    const wagerLamports = match?.config?.wagerLamports || 0;
    const wagerSOL = wagerLamports / SOL_PER_LAMPORT;

    // The roster the screen actually renders — live broadcasts override
    // the initial fetch as deposits land.
    const renderedRoster = depositRoster || (match?.players?.map(p => ({
        walletAddress: p.walletAddress,
        callsign: p.callsign,
        deposited: !!p.initialDepositTx,
    })) || []);
    const depositedCount = renderedRoster.filter(p => p.deposited).length;
    const totalPlayers = match?.players?.length || 0;

    // ── 4. Deposit action — fetch built tx, sign, confirm
    const handleDeposit = useCallback(async () => {
        if (submitInProgress.current) return;
        submitInProgress.current = true;
        setError(null);

        try {
            const sock = window.socket;
            if (!sock) {
                setError('Not connected.');
                setPhase('error');
                return;
            }
            if (!walletAddress) {
                setError('Wallet not connected.');
                setPhase('error');
                return;
            }
            if (!signAndSendGroupDeposit) {
                setError('Wallet signing not ready.');
                setPhase('error');
                return;
            }

            // Step 1: ask server for the deposit tx
            setPhase('building');
            const built = await new Promise((resolve) => {
                const handler = (payload) => {
                    if (payload?.matchId !== matchId) return;
                    sock.off('groupDepositTxBuilt', handler);
                    resolve(payload);
                };
                sock.on('groupDepositTxBuilt', handler);
                sock.emit('requestGroupDepositTx', { matchId });
                // Failsafe timeout — don't hang the UI forever if server is dead
                setTimeout(() => {
                    sock.off('groupDepositTxBuilt', handler);
                    resolve({ error: 'timeout_building_tx' });
                }, 10_000);
            });

            if (built.error) {
                setError(`Couldn't build deposit transaction: ${built.error}`);
                setPhase('error');
                return;
            }

            // Step 2: sign + send (validates client-side, submits, confirms,
            // emits confirmGroupDeposit). The 'groupDepositConfirmed' listener
            // above takes us to the success/failed phase.
            setPhase('signing');
            const sig = await signAndSendGroupDeposit(built.transaction, matchId);
            if (!sig) {
                setError('Signing failed or was rejected.');
                setPhase('error');
                return;
            }
            setTxSignature(sig);
            setPhase('confirming');
            // From here we wait for the server's groupDepositConfirmed reply.
        } catch (err) {
            console.error('[GroupDepositScreen] deposit error:', err);
            setError(err?.message || 'Unexpected error.');
            setPhase('error');
        } finally {
            submitInProgress.current = false;
        }
    }, [matchId, walletAddress, signAndSendGroupDeposit]);

    // ── 5. Render
    //
    // Order matters: auth-prerequisite states render BEFORE the phase
    // machine, otherwise the "Loading match…" placeholder dominates and
    // the user never sees the sign-in CTA when arriving unauthenticated
    // via a deep link. The match-fetch effect is gated on isAuthenticated,
    // so phase stays 'loading' until the socket auths — fine, but we
    // want to show "Sign in" instead of an indefinite spinner when
    // Privy is ready but the user has no wallet yet.

    // Privy SDK still booting — earliest state, no wallet decisions yet.
    if (!privyReady) {
        return (
            <div style={styles.wrap}>
                <div style={styles.card}>
                    <div style={styles.title}>Connecting wallet…</div>
                </div>
            </div>
        );
    }

    // Privy ready but no wallet — surface the sign-in CTA. (We only nudge
    // sign-in when there's no wallet at all; if the wallet is connected
    // but the socket auth handshake hasn't completed yet, fall through to
    // "Loading match…" which is the more accurate state.)
    if (!walletAddress) {
        return (
            <div style={styles.wrap}>
                <div style={styles.card}>
                    <div style={styles.title}>Sign in to deposit</div>
                    <div style={styles.subtitle}>You'll deposit <b>{formatSOL(wagerLamports)} SOL</b> into match <b>#{matchId}</b>.</div>
                    <button style={styles.btnPrimary} onClick={() => login?.()}>Sign in</button>
                    <button style={styles.btnSecondary} onClick={() => navigate('mygames')}>← My matches</button>
                </div>
            </div>
        );
    }

    // Real errors (match-not-found, server errors) take priority over
    // loading once we know the user is signed in.
    if (phase === 'error') {
        return (
            <div style={styles.wrap}>
                <div style={styles.card}>
                    <div style={styles.title}>Deposit unavailable</div>
                    <div style={styles.error}>{error}</div>
                    <button style={styles.btnSecondary} onClick={() => navigate('mygames')}>← My matches</button>
                </div>
            </div>
        );
    }

    // Wallet present but socket auth or match fetch still in flight.
    if (phase === 'loading' || !isAuthenticated) {
        return (
            <div style={styles.wrap}>
                <div style={styles.card}>
                    <div style={styles.title}>Loading match…</div>
                </div>
            </div>
        );
    }

    // Viewer is authed but not a registered player on this match
    if (!viewerPlayer) {
        return (
            <div style={styles.wrap}>
                <div style={styles.card}>
                    <div style={styles.title}>Not in this match</div>
                    <div style={styles.subtitle}>Your wallet doesn't match any player slot. The host may have re-rolled the lobby.</div>
                    <button style={styles.btnSecondary} onClick={() => navigate('mygames')}>← My matches</button>
                </div>
            </div>
        );
    }

    const insufficientBalance = balance != null && balance < wagerSOL;

    return (
        <div style={styles.wrap}>
            <div style={styles.card}>
                <div style={styles.title}>Deposit for match #{matchId}</div>
                <div style={styles.subtitle}>
                    Wager: <b>{formatSOL(wagerLamports)} SOL</b> · Pot at full deposits: <b>{formatSOL(wagerLamports * totalPlayers)} SOL</b>
                </div>
                <div style={styles.subtitle}>
                    Players: <b>{depositedCount}/{totalPlayers}</b> deposited
                </div>

                <ul style={styles.roster}>
                    {renderedRoster.map((p, i) => (
                        <li key={i} style={p.deposited ? styles.rosterPaid : styles.rosterPending}>
                            <span>{formatPlayerLabel(p)}</span>
                            <span>{p.deposited ? '✓ paid' : '… waiting'}</span>
                        </li>
                    ))}
                </ul>

                {viewerHasDeposited || phase === 'done' ? (
                    <>
                        <div style={styles.successBanner}>
                            ✓ Your deposit is in. Match starts when everyone has paid.
                        </div>
                        {txSignature && (
                            <div style={styles.txSig}>
                                TX: <code>{txSignature.slice(0, 12)}…</code>
                            </div>
                        )}
                        <button style={styles.btnSecondary} onClick={() => navigate('mygames')}>← My matches</button>
                    </>
                ) : (
                    <>
                        {balance != null && (
                            <div style={styles.balance}>
                                Wallet balance: <b>{balance.toFixed(4)} SOL</b>
                                {insufficientBalance && <span style={styles.warn}> (need {wagerSOL.toFixed(4)} SOL)</span>}
                            </div>
                        )}

                        {phase === 'building' && <div style={styles.status}>Building deposit transaction…</div>}
                        {phase === 'signing' && <div style={styles.status}>Sign in your wallet…</div>}
                        {phase === 'confirming' && <div style={styles.status}>Confirming on devnet…</div>}

                        <button
                            style={(phase !== 'ready' || insufficientBalance) ? styles.btnDisabled : styles.btnPrimary}
                            onClick={handleDeposit}
                            disabled={phase !== 'ready' || insufficientBalance}
                        >
                            {phase === 'ready' ? `💸 Deposit ${formatSOL(wagerLamports)} SOL` : 'Working…'}
                        </button>
                        <button style={styles.btnSecondary} onClick={refreshBalance}>↻ Refresh balance</button>
                        <button style={styles.btnSecondary} onClick={() => navigate('mygames')}>← Back</button>

                        <div style={styles.fineprint}>
                            Refund window opens 24h after match end if the server fails to settle —
                            anyone can trigger the on-chain refund to your wallet, no support needed.
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

const styles = {
    wrap: {
        // Layout wrapper sets overflow: hidden — fill it with height: 100%
        // and own the scroll here so iPhone Safari (where the URL bar +
        // bottom nav eat ~25% of viewport in landscape) doesn't clip the
        // deposit button. WebkitOverflowScrolling for momentum on iOS.
        height: '100%',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        background: '#0a0a0f',
        color: '#e8e8f0',
        fontFamily: '"VT323", "Courier New", monospace',
        padding: '24px 16px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    card: {
        width: '100%',
        maxWidth: 460,
        background: '#13131a',
        border: '1px solid #2a2a35',
        borderRadius: 4,
        padding: 24,
        boxShadow: '0 0 0 1px #1a1a22 inset, 0 0 24px rgba(255, 200, 0, 0.06)',
    },
    title: {
        fontSize: 22,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: '#ffcc44',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#b0b0bd',
        marginBottom: 12,
    },
    roster: {
        listStyle: 'none',
        padding: 0,
        margin: '12px 0 16px',
    },
    rosterPaid: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: 'rgba(80, 200, 120, 0.12)',
        borderLeft: '3px solid #50c878',
        marginBottom: 4,
    },
    rosterPending: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: 'rgba(255, 255, 255, 0.03)',
        borderLeft: '3px solid #44444f',
        marginBottom: 4,
        color: '#888899',
    },
    balance: {
        fontSize: 14,
        color: '#b0b0bd',
        marginBottom: 12,
    },
    warn: { color: '#ff6644' },
    error: {
        background: 'rgba(255, 60, 60, 0.12)',
        border: '1px solid #ff3c3c',
        padding: 12,
        marginBottom: 12,
        color: '#ffaaaa',
    },
    status: {
        fontSize: 14,
        color: '#ffcc44',
        marginBottom: 8,
    },
    successBanner: {
        background: 'rgba(80, 200, 120, 0.16)',
        border: '1px solid #50c878',
        padding: 12,
        marginBottom: 12,
        color: '#9ae6b4',
        textAlign: 'center',
    },
    txSig: {
        fontSize: 12,
        color: '#888899',
        marginBottom: 12,
        textAlign: 'center',
    },
    btnPrimary: {
        width: '100%',
        padding: '14px 16px',
        background: '#ffcc44',
        color: '#13131a',
        border: 'none',
        fontFamily: 'inherit',
        fontSize: 16,
        textTransform: 'uppercase',
        letterSpacing: 1,
        cursor: 'pointer',
        marginBottom: 8,
    },
    btnDisabled: {
        width: '100%',
        padding: '14px 16px',
        background: '#44444f',
        color: '#888899',
        border: 'none',
        fontFamily: 'inherit',
        fontSize: 16,
        textTransform: 'uppercase',
        letterSpacing: 1,
        cursor: 'not-allowed',
        marginBottom: 8,
    },
    btnSecondary: {
        width: '100%',
        padding: '10px 16px',
        background: 'transparent',
        color: '#b0b0bd',
        border: '1px solid #2a2a35',
        fontFamily: 'inherit',
        fontSize: 14,
        textTransform: 'uppercase',
        letterSpacing: 1,
        cursor: 'pointer',
        marginBottom: 6,
    },
    fineprint: {
        fontSize: 12,
        color: '#666677',
        marginTop: 16,
        lineHeight: 1.5,
    },
};
