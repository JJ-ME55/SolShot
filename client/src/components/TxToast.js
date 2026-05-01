/**
 * TxToast — small bottom-anchored toast for stale-data / non-blocking errors.
 *
 * Use cases:
 *   - A refetch failed but we still have stale data on screen
 *     (don't blow the screen away with <ErrorState>)
 *   - A background save failed (e.g. unstable connection)
 *   - A non-critical action returned an error code
 *   - A success confirmation that doesn't warrant a modal
 *
 * Field-manual aesthetic. Uses design tokens. Auto-dismisses after
 * `duration` ms (default 4000), or stays sticky if `duration === 0`.
 *
 * Usage:
 *
 *   const [toast, setToast] = useState(null);
 *   <TxToast toast={toast} onDismiss={() => setToast(null)} />
 *
 *   // Show:
 *   setToast({ kind: 'error', text: 'COULDN\'T REFRESH MATCH FEED' });
 *   setToast({ kind: 'success', text: 'WEAPON ACQUIRED' });
 *   setToast({ kind: 'info',    text: 'OPPONENT RECONNECTED' });
 *
 * Or use the imperative helper:
 *
 *   import { showToast } from './TxToast';
 *   showToast({ kind: 'error', text: 'FOO FAILED' });
 *
 * The imperative helper requires `<TxToastHost />` mounted somewhere
 * in the tree (typically inside Layout) — it listens for a custom
 * 'solshot:toast' window event and renders the toast.
 */

import React, { useEffect, useState } from 'react';

const KIND_COLORS = {
    error:   { border: 'var(--red)',     icon: '✱', glyph: 'var(--red)' },
    success: { border: 'var(--accent)',  icon: '◆', glyph: 'var(--accent)' },
    info:    { border: 'var(--olive)',   icon: '▸', glyph: 'var(--olive)' },
};

export function TxToast({ toast, onDismiss, duration = 4000 }) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!toast) {
            setVisible(false);
            return;
        }
        // Trigger entry transition next tick so opacity goes 0 → 1
        const t1 = setTimeout(() => setVisible(true), 10);
        if (duration > 0) {
            const t2 = setTimeout(() => {
                setVisible(false);
                // Allow exit transition to play before clearing parent state
                setTimeout(() => onDismiss && onDismiss(), 200);
            }, duration);
            return () => { clearTimeout(t1); clearTimeout(t2); };
        }
        return () => clearTimeout(t1);
    }, [toast, duration, onDismiss]);

    if (!toast) return null;
    const kind = KIND_COLORS[toast.kind] || KIND_COLORS.info;

    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                position: 'fixed',
                left: '50%',
                bottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
                transform: `translateX(-50%) translateY(${visible ? '0' : '12px'})`,
                opacity: visible ? 1 : 0,
                transition: 'opacity 200ms ease-out, transform 200ms ease-out',
                zIndex: 10000,
                pointerEvents: visible ? 'auto' : 'none',
                maxWidth: 'min(92vw, 460px)',
                padding: '10px 16px',
                background: 'var(--bg-surface)',
                border: `1px solid ${kind.border}`,
                clipPath: 'var(--clip-6)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontFamily: 'var(--f-mono)',
                fontSize: 11,
                letterSpacing: '0.18em',
                color: 'var(--bone)',
                textTransform: 'uppercase',
                boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
            }}
        >
            <span style={{ color: kind.glyph, fontSize: 13 }}>{kind.icon}</span>
            <span style={{ flex: 1, lineHeight: 1.4 }}>{toast.text}</span>
            {toast.actionLabel && toast.onAction && (
                <button
                    onClick={toast.onAction}
                    style={{
                        fontFamily: 'var(--f-display)',
                        fontSize: 10,
                        letterSpacing: '0.22em',
                        padding: '4px 10px',
                        background: 'transparent',
                        color: kind.glyph,
                        border: `1px solid ${kind.border}`,
                        clipPath: 'var(--clip-6)',
                        cursor: 'pointer',
                    }}
                >
                    {toast.actionLabel}
                </button>
            )}
            <button
                onClick={() => { setVisible(false); setTimeout(() => onDismiss && onDismiss(), 200); }}
                aria-label="Dismiss"
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--olive)',
                    cursor: 'pointer',
                    padding: '0 4px',
                    fontSize: 14,
                    lineHeight: 1,
                }}
            >
                ✕
            </button>
        </div>
    );
}

/**
 * TxToastHost — mount once at the app root. Listens for window
 * 'solshot:toast' events so any code in the tree can fire a toast
 * without prop drilling.
 *
 *   showToast({ kind: 'error', text: 'X FAILED' });
 *   // → fires window.dispatchEvent(new CustomEvent('solshot:toast', { detail }))
 */
export function TxToastHost() {
    const [toast, setToast] = useState(null);
    useEffect(() => {
        const handler = (e) => setToast(e.detail);
        window.addEventListener('solshot:toast', handler);
        return () => window.removeEventListener('solshot:toast', handler);
    }, []);
    return <TxToast toast={toast} onDismiss={() => setToast(null)} />;
}

/** Imperative show — fires a custom event picked up by <TxToastHost />. */
export function showToast(toast) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('solshot:toast', { detail: toast }));
}

export default TxToast;
