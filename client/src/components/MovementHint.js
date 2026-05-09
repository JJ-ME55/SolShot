/**
 * MovementHint — tiny in-battle reminder that you can re-position your
 * tank with A / D (desktop) or the ◂ ▸ buttons (mobile).
 *
 * Shows once per device (localStorage) on the player's first turn of
 * the match. Auto-dismisses after 9 seconds, or as soon as the player
 * actually moves (handled via the `dismissed` prop / move-key listener).
 *
 * Positioned bottom-center on desktop (above the BattleHUD control
 * bar) and just above the mobile MoveCluster on mobile. Pointer-events
 * pass through except for the ✕ button so it doesn't eat fire-button
 * clicks if the player happens to tap underneath.
 *
 * Hidden in group-chat mode because v1 of the group-match flow doesn't
 * permit movement between turns — see handleMoveLeftFromReact in the
 * scene for the gate.
 *
 * Usage:
 *   <MovementHint
 *     active={isPlayerTurn && gameMode !== 'group-chat'}
 *     gameMode={gameMode}
 *     storageKey="solshot.hint.movement.v1"
 *   />
 *
 * JJ pre-submission ask, May 9 — paired with the first-shot trajectory
 * preview as a "what's possible in this match" gauge for new players.
 */

import React, { useEffect, useRef, useState } from 'react';
import useIsMobile from '../hooks/useIsMobile';

const HINT_DURATION_MS = 9000;

export default function MovementHint({
    active = false,
    gameMode,
    storageKey = 'solshot.hint.movement.v1',
}) {
    const isMobile = useIsMobile();
    const isGroupChat = gameMode === 'group-chat';

    const [shown, setShown] = useState(false);
    const [closing, setClosing] = useState(false);
    const timerRef = useRef(null);

    // Has the player already seen + dismissed this hint?
    const seenRef = useRef(false);
    useEffect(() => {
        try { seenRef.current = !!localStorage.getItem(storageKey); } catch (_) {}
    }, [storageKey]);

    // Trigger on first activation (e.g. first time isPlayerTurn flips on
    // and we're not in group-chat). One-shot per match — once shown,
    // we don't re-trigger this session even if the player misses it.
    useEffect(() => {
        if (!active || isGroupChat || shown || seenRef.current) return;
        setShown(true);

        // Auto-fade after HINT_DURATION_MS
        timerRef.current = setTimeout(() => dismiss(), HINT_DURATION_MS);

        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, isGroupChat, shown]);

    // Listen for the actual movement keys (A / D / ←/→). If the player
    // moves on their own, dismiss immediately — we don't need to keep
    // nagging them. Only on desktop; mobile dismiss happens via tap-✕
    // or auto-fade.
    useEffect(() => {
        if (!shown || isMobile) return;
        const onKey = (e) => {
            const k = (e.key || '').toLowerCase();
            if (k === 'a' || k === 'd' || k === 'arrowleft' || k === 'arrowright') {
                dismiss();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shown, isMobile]);

    const dismiss = () => {
        if (closing) return;
        setClosing(true);
        try { localStorage.setItem(storageKey, '1'); } catch (_) {}
        seenRef.current = true;
        // Allow the fade-out animation to complete before unmounting
        setTimeout(() => setShown(false), 260);
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    if (!shown || isGroupChat) return null;

    // Desktop: bottom-center, sitting above the control bar.
    // Mobile: just above the move cluster (which lives bottom-left).
    const posStyle = isMobile
        ? { position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 16px) + 110px)', left: '50%', transform: 'translateX(-50%)' }
        : { position: 'absolute', bottom: 200, left: '50%', transform: 'translateX(-50%)' };

    return (
        <div
            style={{
                ...posStyle,
                zIndex: 18,
                pointerEvents: 'none',
                animation: closing ? 'mh-fadeout 240ms ease-out forwards' : 'mh-fadein 280ms ease-out',
                maxWidth: 'min(92vw, 340px)',
            }}
        >
            <style>{`
                @keyframes mh-fadein {
                    from { opacity: 0; transform: translate(-50%, 6px); }
                    to   { opacity: 1; transform: translate(-50%, 0); }
                }
                @keyframes mh-fadeout {
                    from { opacity: 1; }
                    to   { opacity: 0; }
                }
                @keyframes mh-keypulse {
                    0%,100% { box-shadow: 0 0 0 0 rgba(232,164,48,0); }
                    50%     { box-shadow: 0 0 0 4px rgba(232,164,48,0.18); }
                }
            `}</style>

            <div
                style={{
                    background: 'rgba(10,12,8,0.92)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: '1px solid var(--accent)',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.55), 0 0 14px rgba(232,164,48,0.18)',
                    clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
                    padding: '10px 14px 12px',
                    pointerEvents: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                }}
            >
                {/* Tiny diamond + label header */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{
                        fontFamily: 'var(--f-mono)',
                        fontSize: 8.5,
                        letterSpacing: '0.24em',
                        color: 'var(--olive)',
                        textTransform: 'uppercase',
                    }}>
                        ◆ TIP · MOVE TANK
                    </div>

                    {/* Key cap row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isMobile ? (
                            <>
                                <KeyCap>◂</KeyCap>
                                <span style={{
                                    fontFamily: 'var(--f-mono)', fontSize: 9.5,
                                    color: 'var(--bone)', letterSpacing: '0.18em',
                                }}>OR</span>
                                <KeyCap>▸</KeyCap>
                                <span style={{
                                    fontFamily: 'var(--f-mono)', fontSize: 9,
                                    color: 'var(--olive)', letterSpacing: '0.16em',
                                    marginLeft: 4,
                                }}>BUTTONS</span>
                            </>
                        ) : (
                            <>
                                <KeyCap>A</KeyCap>
                                <span style={{
                                    fontFamily: 'var(--f-mono)', fontSize: 9.5,
                                    color: 'var(--bone)', letterSpacing: '0.18em',
                                }}>/</span>
                                <KeyCap>D</KeyCap>
                                <span style={{
                                    fontFamily: 'var(--f-mono)', fontSize: 9,
                                    color: 'var(--olive)', letterSpacing: '0.16em',
                                    marginLeft: 4,
                                }}>TO STEP</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Manual dismiss — clearly labelled GOT IT button so the
                    player has an obvious "kill this tip" affordance. JJ
                    QA: the original tiny ✕ wasn't reading as clickable. */}
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Dismiss movement tip"
                    style={{
                        background: 'rgba(232,164,48,0.10)',
                        border: '1px solid var(--accent)',
                        color: 'var(--accent)',
                        fontFamily: 'var(--f-display)',
                        fontSize: 11,
                        letterSpacing: '0.18em',
                        lineHeight: 1,
                        cursor: 'pointer',
                        padding: '7px 11px',
                        clipPath: 'polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px))',
                        transition: 'background 0.15s, color 0.15s',
                        alignSelf: 'center',
                        flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--accent)';
                        e.currentTarget.style.color = 'var(--bg-deep)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(232,164,48,0.10)';
                        e.currentTarget.style.color = 'var(--accent)';
                    }}
                >
                    GOT IT ✕
                </button>
            </div>
        </div>
    );
}

// Tiny stylised key-cap pill — accent border, dark fill, mono glyph.
function KeyCap({ children }) {
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 22,
                height: 22,
                padding: '0 6px',
                background: 'rgba(232,164,48,0.10)',
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
                fontFamily: 'var(--f-display)',
                fontSize: 12,
                letterSpacing: '0.06em',
                clipPath: 'polygon(0 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 4px 100%, 0 calc(100% - 4px))',
                animation: 'mh-keypulse 1.6s ease-in-out infinite',
            }}
        >
            {children}
        </span>
    );
}
