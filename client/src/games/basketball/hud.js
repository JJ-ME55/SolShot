import React, { useEffect, useState } from 'react';
import basketballBridge from './bridge.js';

/**
 * BasketballHUD — React overlay for the timed rapid-fire mode.
 *
 * The live HUD (countdown timer, SCORE, BEST, streak indicator) is
 * rendered INSIDE the Phaser canvas as the in-game scoreboard — see
 * scene.js#_createScoreboard. The "+N" score popups are also in-canvas.
 *
 * So the React layer now owns just one thing: the game-over screen
 * shown when the clock runs out (gameState === 'over').
 *
 * Reads state from basketballBridge via a rAF polling loop.
 */
export function BasketballHUD({ onPlayAgain }) {
    const state = useBasketballState();
    const isOver = state.gameState === 'over';

    const handlePlayAgain = () => {
        if (basketballBridge.scene) basketballBridge.scene.playAgain();
        if (onPlayAgain) onPlayAgain();
    };

    return (
        <div style={styles.container}>
            {isOver ? (
                // The whole game-over overlay is the tap target — tap
                // ANYWHERE to play again (JJ feedback 2026-05-14). The
                // "PLAY AGAIN" pill is now just a visual affordance;
                // its click bubbles up to this wrapper.
                <div
                    style={styles.gameOverWrap}
                    onClick={handlePlayAgain}
                    role="button"
                    tabIndex={0}
                >
                    <div style={styles.gameOverCard}>
                        <div style={styles.gameOverTitle}>TIME!</div>
                        <div style={styles.gameOverSubtitle}>
                            You scored <span style={styles.gameOverScore}>{state.score}</span>
                        </div>
                        <div style={styles.gameOverBest}>
                            Best so far: {state.bestScore}
                        </div>
                        <div style={styles.playAgainBtn}>TAP TO PLAY AGAIN</div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

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
        fontSize: 34,
        fontWeight: 900,
        letterSpacing: 4,
        color: '#ff5544',
        marginBottom: 10,
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
