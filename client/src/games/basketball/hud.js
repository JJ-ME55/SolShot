import React, { useEffect, useState } from 'react';
import basketballBridge from './bridge.js';

/**
 * BasketballHUD — score, heat-check indicator, last-result toast,
 * and the "Play Again" CTA when the round ends.
 *
 * Reads state from basketballBridge via a rAF polling loop. Mirrors
 * the pattern used by SolShot's React HUD (BattleHUD).
 */
export function BasketballHUD({ onPlayAgain }) {
    const state = useBasketballState();

    return (
        <div style={styles.container}>
            <div style={styles.topBar}>
                <div style={styles.scorePill}>
                    <div style={styles.label}>SCORE</div>
                    <div style={styles.scoreValue}>{state.score}</div>
                </div>
                <div style={styles.scorePill}>
                    <div style={styles.label}>BEST</div>
                    <div style={styles.scoreValue}>{state.bestScore}</div>
                </div>
                {state.heatCheckActive ? (
                    <div style={styles.heatPill}>
                        <span style={styles.heatDot}>●</span> HEAT CHECK
                    </div>
                ) : null}
            </div>

            {state.lastResult && !state.roundOver ? (
                <div style={styles.toastWrap}>
                    <ResultToast result={state.lastResult} points={state.lastPoints} />
                </div>
            ) : null}

            {state.roundOver ? (
                <div style={styles.gameOverWrap}>
                    <div style={styles.gameOverCard}>
                        <div style={styles.gameOverTitle}>ROUND OVER</div>
                        <div style={styles.gameOverSubtitle}>
                            You scored <span style={styles.gameOverScore}>{state.score}</span>
                        </div>
                        <div style={styles.gameOverBest}>
                            Best so far: {state.bestScore}
                        </div>
                        <button
                            type="button"
                            style={styles.playAgainBtn}
                            onClick={() => {
                                if (basketballBridge.scene) basketballBridge.scene.playAgain();
                                if (onPlayAgain) onPlayAgain();
                            }}
                        >
                            PLAY AGAIN
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function ResultToast({ result, points }) {
    const label = RESULT_LABELS[result] || result;
    const tint = result === 'swish' ? '#ffcc00' : '#ffffff';
    return (
        <div style={{ ...styles.toast, color: tint }}>
            {label}{points > 0 ? ` +${points}` : null}
        </div>
    );
}

const RESULT_LABELS = {
    swish: 'SWISH',
    rim_in: 'IN',
    bank_in: 'BANK',
    rim_out: 'RIM OUT',
    bank_out: 'OFF BACKBOARD',
    airball: 'AIRBALL',
};

/**
 * Hook that polls basketballBridge each rAF tick and triggers a
 * re-render whenever the bridge marks itself dirty.
 */
function useBasketballState() {
    const [state, setState] = useState(() => ({ ...basketballBridge.state }));

    useEffect(() => {
        let alive = true;
        function tick() {
            if (!alive) return;
            const snap = basketballBridge.consume();
            if (snap) setState(snap);
            requestAnimationFrame(tick);
        }
        const raf = requestAnimationFrame(tick);
        return () => {
            alive = false;
            cancelAnimationFrame(raf);
        };
    }, []);

    return state;
}

const styles = {
    container: {
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#fff',
        userSelect: 'none',
    },
    topBar: {
        position: 'absolute',
        top: 16,
        left: 16,
        right: 16,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
    },
    scorePill: {
        background: 'rgba(10, 10, 10, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 10,
        padding: '8px 14px',
        minWidth: 70,
        textAlign: 'center',
    },
    label: {
        fontSize: 10,
        letterSpacing: 1.5,
        opacity: 0.7,
    },
    scoreValue: {
        fontSize: 22,
        fontWeight: 700,
        marginTop: 2,
        fontVariantNumeric: 'tabular-nums',
    },
    heatPill: {
        marginLeft: 'auto',
        background: 'rgba(255, 102, 0, 0.18)',
        border: '1px solid rgba(255, 136, 0, 0.7)',
        color: '#ffaa55',
        borderRadius: 10,
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: 1.2,
        animation: 'pulse-heat 1.2s ease-in-out infinite',
    },
    heatDot: {
        color: '#ff5500',
        marginRight: 6,
    },
    toastWrap: {
        position: 'absolute',
        top: '32%',
        left: 0,
        right: 0,
        textAlign: 'center',
        pointerEvents: 'none',
    },
    toast: {
        display: 'inline-block',
        fontSize: 36,
        fontWeight: 800,
        letterSpacing: 2,
        textShadow: '0 2px 12px rgba(0, 0, 0, 0.6)',
        animation: 'toast-fade 1.4s ease-out forwards',
    },
    gameOverWrap: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.55)',
        pointerEvents: 'auto',
    },
    gameOverCard: {
        background: '#181818',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 14,
        padding: '28px 32px',
        textAlign: 'center',
        maxWidth: 340,
    },
    gameOverTitle: {
        fontSize: 12,
        letterSpacing: 3,
        opacity: 0.55,
        marginBottom: 4,
    },
    gameOverSubtitle: {
        fontSize: 20,
        opacity: 0.95,
        marginBottom: 6,
    },
    gameOverScore: {
        fontWeight: 800,
        fontSize: 28,
        color: '#ffcc00',
    },
    gameOverBest: {
        fontSize: 13,
        opacity: 0.55,
        marginBottom: 18,
    },
    playAgainBtn: {
        background: '#ffcc00',
        color: '#101010',
        border: 'none',
        padding: '10px 22px',
        borderRadius: 8,
        fontWeight: 700,
        letterSpacing: 1.5,
        fontSize: 14,
        cursor: 'pointer',
    },
};
