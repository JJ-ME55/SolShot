import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { createScene } from './scene.js';

/**
 * KeepieUppiesScreen — top-level React component mounting the Phaser
 * scene for the standalone Keepie Uppies build.
 *
 * Mirror of BasketballScreen on arcade/basketball:
 *   - Captures `?session=<jwt>` from the launch URL on mount and stashes
 *     it in sessionStorage. @TheArcadeGG_Bot mints this JWT when the
 *     user taps /keepieuppies; the scene reads it back at game-over and
 *     forwards it to the leaderboard submit endpoint.
 *   - Boots a Phaser game with the keepie-uppies scene attached.
 *
 * If no session JWT is in the URL (user opened the URL directly), the
 * game still plays — score submission is silently skipped at game-end.
 */
export function KeepieUppiesScreen() {
    const phaserHostRef = useRef(null);
    const gameRef = useRef(null);

    useEffect(() => {
        try {
            const session = new URLSearchParams(window.location.search).get('session');
            if (session) sessionStorage.setItem('arcade_session', session);
        } catch (_) { /* ignore — no leaderboard for this play, game still works */ }
    }, []);

    useEffect(() => {
        if (!phaserHostRef.current || gameRef.current) return;
        const SceneClass = createScene();
        gameRef.current = new Phaser.Game({
            type: Phaser.AUTO,
            parent: phaserHostRef.current,
            width: 800,
            height: 1200,
            scale: {
                mode: Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.CENTER_BOTH,
            },
            backgroundColor: '#4a7fb3',
            scene: SceneClass,
        });
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
            {/* Escape hatch for Telegram in-app browser — TG WebView is
                flaky for sessionStorage + fetch (drops POSTs on
                dismissal). Tapping this opens the same URL with the
                JWT in Safari/Chrome where everything works. Always
                visible because we can't reliably detect TG WebView. */}
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
        height: '100dvh',
        overflow: 'hidden',
        background: '#0f1c2e',
    },
    phaserHost: {
        width: '100%',
        height: '100%',
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
