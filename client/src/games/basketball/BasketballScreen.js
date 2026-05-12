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
};

export default BasketballScreen;
