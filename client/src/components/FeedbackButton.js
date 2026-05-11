import React, { useState, useCallback, useEffect } from 'react';
import { useSolShotWallet } from '../wallet/WalletContext';

/**
 * FeedbackButton - floating button that opens a feedback / bug-report modal.
 *
 * Mounted globally via Layout.js so it's available on every screen. Lives
 * bottom-left at small scale to stay out of the way of the main UI (FIRE
 * button bottom-right on mobile, action buttons mid-screen on desktop).
 *
 * Auto-collects context for triage: current screen path, user-agent,
 * wallet address (if authed). Posts to POST /api/feedback. Server is
 * rate-limited 5/IP/hour and writes to the Feedback Mongo collection.
 *
 * Hidden during active battles - the canvas claims the full viewport on
 * mobile and we don't want a competing tap target overlapping the FIRE
 * button. The path-check covers /battle and /group-battle routes.
 *
 * No auth required. Anyone visiting solshot.gg can file a report.
 */

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://solshot-server.onrender.com';

export default function FeedbackButton() {
    const [open, setOpen] = useState(false);
    const [hidden, setHidden] = useState(false);

    // Hide during active battles to avoid overlapping the FIRE button
    // and the bottom-left move cluster + weapon strip on mobile.
    // SolShot routes are state-driven (not path-driven) so URL pathname
    // can't tell us a match is running. Both BattleScreen and
    // GroupBattleWrapper set `window.__solshotInBattle = true` on mount
    // and dispatch a `solshot:battle-state` event on transition.
    useEffect(() => {
        const check = () => setHidden(!!window.__solshotInBattle);
        check();
        window.addEventListener('solshot:battle-state', check);
        return () => window.removeEventListener('solshot:battle-state', check);
    }, []);

    if (hidden) return null;

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                aria-label="Send feedback or report a bug"
                title="Send feedback / report a bug"
                style={{
                    position: 'fixed',
                    bottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
                    left: 'max(12px, env(safe-area-inset-left, 12px))',
                    zIndex: 9000,
                    width: 38,
                    height: 38,
                    background: 'rgba(10, 12, 8, 0.85)',
                    color: 'var(--olive, #b8a88a)',
                    border: '1px solid rgba(232, 216, 154, 0.30)',
                    fontFamily: 'var(--f-display, "Black Ops One", cursive)',
                    fontSize: 18,
                    lineHeight: 1,
                    cursor: 'pointer',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
                    transition: 'color 0.15s, background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--accent, #e8a430)';
                    e.currentTarget.style.borderColor = 'var(--accent, #e8a430)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--olive, #b8a88a)';
                    e.currentTarget.style.borderColor = 'rgba(232, 216, 154, 0.30)';
                }}
            >
                ?
            </button>
            {open && <FeedbackModal onClose={() => setOpen(false)} />}
        </>
    );
}

function FeedbackModal({ onClose }) {
    const { walletAddress, walletHandle } = useSolShotWallet();
    const [kind, setKind] = useState('feedback');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null); // 'ok' | 'err' | null

    // Esc closes the modal (when not submitting)
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !submitting) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, submitting]);

    const submit = useCallback(async () => {
        if (!message.trim() || submitting) return;
        setSubmitting(true);
        setResult(null);
        try {
            const contextHint = JSON.stringify({
                path: window.location.pathname || '',
                hash: window.location.hash || '',
                viewport: `${window.innerWidth}x${window.innerHeight}`,
                ts: new Date().toISOString(),
            });
            const handle = walletHandle?.handle || '';
            const res = await fetch(`${SERVER_URL}/api/feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message.trim(),
                    kind,
                    contextHint,
                    handle,
                    walletAddress: walletAddress || '',
                }),
            });
            if (res.ok) {
                setResult('ok');
                setMessage('');
                // Auto-close after 2s on success
                setTimeout(() => onClose(), 2000);
            } else {
                const data = await res.json().catch(() => ({}));
                setResult(data?.error === 'rate_limited' ? 'rate' : 'err');
            }
        } catch (err) {
            setResult('err');
        } finally {
            setSubmitting(false);
        }
    }, [message, kind, walletAddress, walletHandle, submitting, onClose]);

    return (
        <div
            onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
            style={{
                position: 'fixed', inset: 0, zIndex: 12000,
                background: 'rgba(0, 0, 0, 0.78)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16, animation: 'fb-fade 200ms ease-out',
            }}
        >
            <style>{`
                @keyframes fb-fade { from { opacity: 0; } to { opacity: 1; } }
                @keyframes fb-pop { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
            <div
                style={{
                    maxWidth: 460, width: '100%',
                    background: 'var(--bg-surface, #14180c)',
                    border: '1px solid var(--accent, #e8a430)',
                    clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
                    padding: '20px 22px 18px',
                    position: 'relative',
                    animation: 'fb-pop 220ms ease-out',
                }}
            >
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontFamily: 'var(--f-mono, "Share Tech Mono", monospace)',
                    fontSize: 9, letterSpacing: '0.22em',
                    color: 'var(--olive, #b8a88a)', marginBottom: 12,
                    textTransform: 'uppercase',
                }}>
                    <span>SEND FEEDBACK</span>
                    <button
                        onClick={!submitting ? onClose : undefined}
                        style={{
                            background: 'transparent', border: 'none',
                            color: 'var(--olive, #b8a88a)', fontSize: 14,
                            letterSpacing: '0.2em', cursor: submitting ? 'default' : 'pointer',
                            padding: 0, opacity: submitting ? 0.4 : 1,
                        }}
                    >CLOSE ✕</button>
                </div>

                <div style={{
                    fontFamily: 'var(--f-display, "Black Ops One", cursive)',
                    fontSize: 22, color: 'var(--bone, #e8e4d0)',
                    letterSpacing: '0.08em', textAlign: 'center',
                    marginBottom: 4,
                }}>
                    HEARD YOU
                </div>
                <div style={{
                    width: 40, height: 1, background: 'var(--accent, #e8a430)',
                    margin: '6px auto 14px',
                }} />
                <div style={{
                    fontFamily: 'var(--f-mono, "Share Tech Mono", monospace)',
                    fontSize: 10, color: 'var(--olive, #b8a88a)',
                    letterSpacing: '0.10em', lineHeight: 1.55, textAlign: 'center',
                    marginBottom: 16, textTransform: 'uppercase',
                }}>
                    Spotted a bug, got an idea, or just want to vent?<br />
                    We read every one. Early days - your fire matters.
                </div>

                {/* Kind selector - 3 buttons */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                    {[
                        { v: 'bug', label: 'BUG' },
                        { v: 'feedback', label: 'FEEDBACK' },
                        { v: 'idea', label: 'IDEA' },
                    ].map(({ v, label }) => (
                        <button
                            key={v}
                            type="button"
                            onClick={() => setKind(v)}
                            disabled={submitting}
                            style={{
                                flex: 1, padding: '8px 0',
                                background: kind === v ? 'rgba(232, 164, 48, 0.14)' : 'transparent',
                                border: '1px solid ' + (kind === v ? 'var(--accent, #e8a430)' : 'rgba(184,168,138,0.25)'),
                                color: kind === v ? 'var(--accent, #e8a430)' : 'var(--olive, #b8a88a)',
                                fontFamily: 'var(--f-display, "Black Ops One", cursive)',
                                fontSize: 11, letterSpacing: '0.18em',
                                cursor: submitting ? 'default' : 'pointer',
                                clipPath: 'polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px))',
                                transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                            }}
                        >{label}</button>
                    ))}
                </div>

                <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
                    placeholder={
                        kind === 'bug' ? 'What broke? What did you expect? What actually happened?' :
                        kind === 'idea' ? "What's the idea? What would it unlock?" :
                        "Tell us anything: what works, what doesn't, what we should know."
                    }
                    disabled={submitting}
                    rows={5}
                    style={{
                        width: '100%', boxSizing: 'border-box',
                        background: 'rgba(10, 12, 8, 0.7)',
                        border: '1px solid rgba(184,168,138,0.30)',
                        color: 'var(--bone, #e8e4d0)',
                        fontFamily: 'var(--f-mono, "Share Tech Mono", monospace)',
                        fontSize: 13, lineHeight: 1.5,
                        padding: '10px 12px',
                        resize: 'vertical',
                        outline: 'none',
                        marginBottom: 6,
                    }}
                    onFocus={(e) => { e.target.style.borderColor = 'var(--accent, #e8a430)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgba(184,168,138,0.30)'; }}
                />
                <div style={{
                    fontFamily: 'var(--f-mono, "Share Tech Mono", monospace)',
                    fontSize: 9, color: 'var(--olive, #b8a88a)',
                    letterSpacing: '0.16em', textAlign: 'right', marginBottom: 14,
                    opacity: 0.6,
                }}>
                    {message.length} / 2000
                </div>

                {result === 'ok' && (
                    <div style={{
                        fontFamily: 'var(--f-mono, "Share Tech Mono", monospace)',
                        fontSize: 11, color: 'var(--gg, #14F195)',
                        letterSpacing: '0.16em', textAlign: 'center', marginBottom: 12,
                        textTransform: 'uppercase',
                    }}>✓ SENT. THANKS.</div>
                )}
                {result === 'err' && (
                    <div style={{
                        fontFamily: 'var(--f-mono, "Share Tech Mono", monospace)',
                        fontSize: 11, color: 'var(--red, #cf4646)',
                        letterSpacing: '0.16em', textAlign: 'center', marginBottom: 12,
                        textTransform: 'uppercase',
                    }}>SEND FAILED. TRY AGAIN.</div>
                )}
                {result === 'rate' && (
                    <div style={{
                        fontFamily: 'var(--f-mono, "Share Tech Mono", monospace)',
                        fontSize: 11, color: 'var(--accent, #e8a430)',
                        letterSpacing: '0.16em', textAlign: 'center', marginBottom: 12,
                        textTransform: 'uppercase',
                    }}>RATE LIMITED. TRY AGAIN LATER.</div>
                )}

                <button
                    type="button"
                    onClick={submit}
                    disabled={submitting || !message.trim()}
                    style={{
                        width: '100%', padding: '11px 0',
                        background: submitting || !message.trim() ? 'rgba(232, 164, 48, 0.18)' : 'var(--accent, #e8a430)',
                        color: submitting || !message.trim() ? 'var(--olive, #b8a88a)' : 'var(--bg-deep, #0e1209)',
                        border: 'none',
                        fontFamily: 'var(--f-display, "Black Ops One", cursive)',
                        fontSize: 14, letterSpacing: '0.2em',
                        cursor: submitting || !message.trim() ? 'default' : 'pointer',
                        clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
                        transition: 'background 0.15s',
                    }}
                >
                    {submitting ? 'SENDING…' : 'SEND'}
                </button>
            </div>
        </div>
    );
}
