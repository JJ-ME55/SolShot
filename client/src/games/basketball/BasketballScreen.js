import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { makeBasketballGameConfig } from './scene.js';
import { BasketballHUD } from './hud.js';

/**
 * BasketballScreen — top-level React component mounting the Phaser
 * scene + HUD overlay.
 *
 * Mounts a Phaser game into a dedicated div on first render, tears it
 * down on unmount. The HUD sits absolutely-positioned on top.
 *
 * For Phase 4 integration this will get wired into the app router /
 * MenuScreen flow. For v0 it can be rendered standalone in a test
 * page to validate the gameplay loop.
 */
export function BasketballScreen() {
    const phaserHostRef = useRef(null);
    const gameRef = useRef(null);

    // Capture the arcade-bot session JWT from the launch URL (if present).
    // @TheArcadeGG_Bot mints this per-user when they tap /basketball; we
    // forward it on score submission so the leaderboard can tie the score
    // to a verified Telegram identity. Stashed in sessionStorage so
    // multiple games in the same browser session reuse the same JWT
    // (24h TTL on the JWT itself). If no session is present (user opened
    // the URL directly, not via the bot), the game still plays — score
    // submission is just skipped at game-end.
    useEffect(() => {
        try {
            const session = new URLSearchParams(window.location.search).get('session');
            if (session) sessionStorage.setItem('arcade_session', session);
        } catch (_) { /* ignore — no leaderboard for this play, game still works */ }
    }, []);

    useEffect(() => {
        if (!phaserHostRef.current) return;
        if (gameRef.current) return;
        const config = makeBasketballGameConfig(phaserHostRef.current);
        gameRef.current = new Phaser.Game(config);
        return () => {
            if (gameRef.current) {
                gameRef.current.destroy(true);
                gameRef.current = null;
            }
        };
    }, []);

    return (
        <div style={styles.root}>
            <div ref={phaserHostRef} style={styles.phaserHost} />
            <BasketballHUD />
            {/* Escape hatch for Telegram in-app browser — TG WebView is
                flaky for sessionStorage + fetch (drops POSTs on
                dismissal, on iPhone the leaderboard submission silently
                fails). Tapping this opens the same URL with the JWT
                preserved in Safari/Chrome where everything works.
                Always visible because we can't reliably detect TG
                WebView; harmless in regular browsers. */}
            <a
                href={typeof window !== 'undefined' ? window.location.href : '#'}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.safariLink}
            >
                Open in Safari ↗
            </a>
        </div>
    );
}

const styles = {
    root: {
        position: 'relative',
        width: '100vw',
        height: '100vh',
        background: '#0a0a0a',
        overflow: 'hidden',
    },
    phaserHost: {
        position: 'absolute',
        inset: 0,
    },
    safariLink: {
        position: 'absolute',
        top: 'max(env(safe-area-inset-top, 0px), 8px)',
        right: 'max(env(safe-area-inset-right, 0px), 8px)',
        padding: '6px 10px',
        borderRadius: 6,
        background: 'rgba(0, 0, 0, 0.55)',
        color: '#ffffff',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 12,
        fontWeight: 600,
        textDecoration: 'none',
        letterSpacing: 0.5,
        zIndex: 10,
        WebkitTapHighlightColor: 'transparent',
    },
};

export default BasketballScreen;
