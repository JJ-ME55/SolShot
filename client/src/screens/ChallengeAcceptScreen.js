import React, { useState, useEffect, useCallback } from 'react';
import ScreenHeader from '../components/design/ScreenHeader';
import TerrainSilhouette from '../components/design/Terrain';
import { ErrorState, EmptyState, SkeletonRow } from '../components/EmptyStates';

/**
 * ChallengeAcceptScreen
 * ─────────────────────
 * Recipient lands here after tapping ACCEPT on a challenge card
 * (deep link: solshot.gg/?startapp=ch_<shortCode>).
 *
 * Fetches the challenge, shows the terms, and on Accept emits a
 * socket `joinChallenge` event which creates / joins the private room.
 *
 * Props:
 *   navigate(screen, screenData?)
 *   screenData.challengeCode  — the 5-char short code parsed from startapp
 */
export default function ChallengeAcceptScreen({ navigate, screenData }) {
    const code = (screenData?.challengeCode || '').toUpperCase();
    const [challenge, setChallenge] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [accepting, setAccepting] = useState(false);

    // Fetch challenge details
    useEffect(() => {
        if (!code) {
            setError('NO_CHALLENGE_CODE');
            setLoading(false);
            return;
        }
        const apiUrl = process.env.REACT_APP_API_URL || '';
        const url = (apiUrl ? apiUrl.replace(/\/$/, '') : '') + '/api/challenge/' + code;
        fetch(url)
            .then((r) => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
            .then((data) => { setChallenge(data); setLoading(false); })
            .catch((err) => { setError(err.message || 'FETCH_FAILED'); setLoading(false); });
    }, [code]);

    const onAccept = useCallback(() => {
        if (!challenge || accepting) return;
        setAccepting(true);
        const sock = window.socket;
        if (!sock) {
            setError('NO_CONNECTION');
            setAccepting(false);
            return;
        }
        const handler = (data) => {
            sock.off('challengeAccepted', handler);
            sock.off('challengeAcceptError', errorHandler);
            if (data?.roomId) {
                navigate('lobby', { autoJoinRoomId: data.roomId });
            } else {
                setError('NO_ROOM');
                setAccepting(false);
            }
        };
        const errorHandler = (data) => {
            sock.off('challengeAccepted', handler);
            sock.off('challengeAcceptError', errorHandler);
            setError(data?.reason || 'ACCEPT_FAILED');
            setAccepting(false);
        };
        sock.once('challengeAccepted', handler);
        sock.once('challengeAcceptError', errorHandler);
        const handle = localStorage.getItem('solshot_handle') || 'OPERATIVE';
        sock.emit('joinChallenge', { shortCode: code, handle });
    }, [challenge, accepting, code, navigate]);

    const onDecline = useCallback(() => {
        navigate('menu');
    }, [navigate]);

    return (
        // Scroll-safe pattern: flex:1 + overflowY:auto + minHeight:0
        // inside Layout's flex viewport. See BarracksScreen for the
        // root-cause story.
        <div style={{
            position: 'relative',
            flex: 1,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            background: 'var(--bg-deep)',
            minHeight: 0,
        }}>
            <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.05,
                backgroundImage: 'linear-gradient(to right, var(--olive) 1px, transparent 1px), linear-gradient(to bottom, var(--olive) 1px, transparent 1px)',
                backgroundSize: '48px 48px',
            }} />
            <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 24px 100px', position: 'relative', zIndex: 3 }}>
                <ScreenHeader
                    title="CHALLENGE"
                    subtitle="DIRECT CALL-OUT"
                    onBack={() => navigate('menu')}
                />

                {/* Loading: 3 stacked skeleton rows shaped roughly like
                    challenger card / hero / footer */}
                {loading && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '24px 0' }}>
                        <SkeletonRow height={48} lines={2} leftAccent />
                        <SkeletonRow height={70} lines={2} />
                        <SkeletonRow height={36} lines={1} />
                    </div>
                )}

                {/* Error: distinct empty-state per failure type so the
                    user knows what they're recovering from. Expired and
                    not-found are EmptyState (informational); transport
                    failures are ErrorState (RETRY-able). */}
                {!loading && error === 'NO_CHALLENGE_CODE' && (
                    <div style={{ position: 'relative', minHeight: 320 }}>
                        <EmptyState
                            icon="search"
                            title="CHALLENGE NOT FOUND"
                            body="NO LIVE MATCH FOR THIS CODE. CHECK SPELLING OR REQUEST A NEW LINK."
                            primaryCTA={{ label: 'FIND MATCH', onClick: () => navigate('menu') }}
                        />
                    </div>
                )}
                {!loading && (error === 'NOT_FOUND' || error === 'expired' || error === 'EXPIRED' || error === 'CANCELLED' || error === 'cancelled') && (
                    <div style={{ position: 'relative', minHeight: 320 }}>
                        <EmptyState
                            icon="skull"
                            title="CHALLENGE EXPIRED"
                            body="THIS LINK NO LONGER POINTS TO A LIVE MATCH. THE WINDOW HAS CLOSED."
                            primaryCTA={{ label: 'FIND MATCH', onClick: () => navigate('menu') }}
                            secondaryCTA={{ label: 'ISSUE NEW CHALLENGE', onClick: () => navigate('menu') }}
                        />
                    </div>
                )}
                {!loading && error && !['NO_CHALLENGE_CODE', 'NOT_FOUND', 'expired', 'EXPIRED', 'CANCELLED', 'cancelled'].includes(error) && (
                    <div style={{ position: 'relative', minHeight: 320 }}>
                        <ErrorState
                            title="LOOKUP FAILED"
                            body="COULDN'T VERIFY CHALLENGE CODE."
                            primaryCTA={{ label: 'RETRY', onClick: () => window.location.reload() }}
                            secondaryCTA={{ label: 'BACK TO MENU', onClick: () => navigate('menu') }}
                        />
                    </div>
                )}

                {!loading && !error && challenge && (
                    <>
                        {/* Status banner */}
                        {challenge.status !== 'open' && (
                            <div style={{
                                padding: '8px 14px', marginBottom: 14,
                                background: 'rgba(168,58,26,0.08)',
                                border: '1px solid rgba(168,58,26,0.3)',
                                fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--red)',
                                letterSpacing: '0.22em', textAlign: 'center',
                            }}>
                                CHALLENGE {challenge.status.toUpperCase()}
                            </div>
                        )}

                        {/* Challenger */}
                        <div style={{
                            background: 'var(--bg-surface)', border: '1px solid var(--border)',
                            clipPath: 'var(--clip-16)', padding: '24px 20px', marginBottom: 14,
                        }}>
                            <div style={{
                                fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)',
                                letterSpacing: '0.22em', marginBottom: 8,
                            }}>CHALLENGER</div>
                            <div style={{
                                fontFamily: 'var(--f-display)', fontSize: 36, color: 'var(--bone)',
                                letterSpacing: '0.04em', lineHeight: 1, marginBottom: 4,
                            }}>{challenge.challengerHandle}</div>
                            {challenge.opponentHandle && (
                                <div style={{
                                    fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--muted)',
                                    letterSpacing: '0.15em', marginTop: 8,
                                }}>
                                    Has called out <span style={{ color: 'var(--bone)' }}>{challenge.opponentHandle}</span>
                                </div>
                            )}
                        </div>

                        {/* Terms */}
                        <div style={{
                            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18,
                        }}>
                            <div style={{
                                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                clipPath: 'var(--clip-6)', padding: '14px 16px', textAlign: 'center',
                            }}>
                                <div style={{
                                    fontFamily: 'var(--f-display)', fontSize: 28, color: 'var(--accent)',
                                    lineHeight: 1, letterSpacing: '0.04em',
                                }}>
                                    {challenge.wager?.amount > 0
                                        ? `${challenge.wager.amount} ${challenge.wager.token}`
                                        : 'PRACTICE'}
                                </div>
                                <div style={{
                                    fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--olive)',
                                    letterSpacing: '0.22em', marginTop: 6,
                                }}>WAGER</div>
                            </div>
                            <div style={{
                                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                                clipPath: 'var(--clip-6)', padding: '14px 16px', textAlign: 'center',
                            }}>
                                <div style={{
                                    fontFamily: 'var(--f-display)', fontSize: 28, color: 'var(--bone)',
                                    lineHeight: 1, letterSpacing: '0.04em',
                                }}>{challenge.format || 'BO1'}</div>
                                <div style={{
                                    fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--olive)',
                                    letterSpacing: '0.22em', marginTop: 6,
                                }}>FORMAT</div>
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <button
                                onClick={onAccept}
                                disabled={challenge.status !== 'open' || accepting}
                                style={{
                                    padding: 16, background: 'var(--accent)', color: '#0e1209',
                                    border: '1px solid var(--accent-hot)', clipPath: 'var(--clip-6)',
                                    fontFamily: 'var(--f-display)', fontSize: 14, letterSpacing: '0.2em',
                                    cursor: (challenge.status !== 'open' || accepting) ? 'not-allowed' : 'pointer',
                                    opacity: (challenge.status !== 'open' || accepting) ? 0.5 : 1,
                                    boxShadow: '0 0 16px rgba(218,138,40,0.3)',
                                }}>
                                {accepting ? '…' : '⚔ ACCEPT'}
                            </button>
                            <button
                                onClick={onDecline}
                                style={{
                                    padding: 16, background: 'transparent', color: 'var(--bone)',
                                    border: '1px solid var(--border)', clipPath: 'var(--clip-6)',
                                    fontFamily: 'var(--f-display)', fontSize: 14, letterSpacing: '0.2em',
                                    cursor: 'pointer',
                                }}>
                                DECLINE
                            </button>
                        </div>

                        <div style={{
                            textAlign: 'center', marginTop: 24,
                            fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--muted)',
                            letterSpacing: '0.25em',
                        }}>
                            CHALLENGE CH-#{code}
                        </div>
                    </>
                )}
            </div>
            <TerrainSilhouette />
        </div>
    );
}
