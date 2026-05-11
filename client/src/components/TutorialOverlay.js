/**
 * TutorialOverlay — first-match orientation, shown once per device.
 *
 * Field-manual / military-briefing aesthetic. Gates new players with a
 * 4-step mission briefing before their first ever fire. Dismissible
 * mid-flow, persisted via localStorage so we never show twice.
 *
 * Mounted by BattleScreen + GroupBattleWrapper (via the active branch
 * of GroupMatchScreen). On mount, checks localStorage; if seen, no-op.
 *
 * Steps (rotate through with NEXT button + dot indicator):
 *   1. AIM    — Q/E or angle slider
 *   2. POWER  — W/S or power slider
 *   3. WEAPON — number keys or weapon picker
 *   4. FIRE   — Space bar / FIRE button
 *
 * Designed mobile-first; on desktop the same overlay just centers
 * within the viewport.
 *
 * Usage:
 *   <TutorialOverlay storageKey="solshot.tutorial.battle" />
 */

import React, { useState, useEffect } from 'react';
import { Icon, CTA } from './EmptyStates';

const STEPS = [
    {
        icon: 'reticle',
        title: 'AIM',
        body: 'TILT THE TURRET. USE Q / E ON KEYBOARD OR THE ANGLE SLIDER ON MOBILE. WIND PUSHES SHOTS LEFT OR RIGHT. CHECK THE WIND METER.',
        accent: 'ANGLE',
    },
    {
        icon: 'target',
        title: 'POWER',
        body: 'CHARGE THE SHOT. W / S ON KEYBOARD, OR THE POWER SLIDER. HIGHER POWER = LONGER REACH BUT LESS PRECISION ON SHORT TARGETS.',
        accent: 'POWER',
    },
    {
        icon: 'crate',
        title: 'WEAPON',
        body: 'SWITCH ARMAMENT WITH NUMBER KEYS 1-9 OR TAP A WEAPON CARD. SINGLE SHOT IS YOUR DEFAULT. STARTING GOLD UNLOCKS BIGGER ROUNDS.',
        accent: 'ARMAMENT',
    },
    {
        icon: 'compass',
        title: 'MOVE',
        body: 'TANK STUCK? RE-POSITION WITH A / D ON KEYBOARD OR THE ◂ ▸ BUTTONS ON MOBILE. EACH TURN GIVES YOU A FEW STEPS. SPEND THEM TO DODGE OR CLOSE THE GAP.',
        accent: 'MANEUVER',
    },
    {
        icon: 'radar',
        title: 'FIRE',
        body: 'COMMIT THE SHOT WITH SPACE BAR OR THE FIRE BUTTON. IMPACT DAMAGE EARNS GOLD; LANDED KILLS EARN A BONUS. GO TO WORK.',
        accent: 'EXECUTE',
    },
];

export default function TutorialOverlay({ storageKey = 'solshot.tutorial.battle' }) {
    const [step, setStep] = useState(0);
    const [open, setOpen] = useState(() => {
        if (typeof window === 'undefined') return false;
        try {
            return !localStorage.getItem(storageKey);
        } catch (_) {
            return true;
        }
    });

    // Dismiss + persist
    const close = () => {
        setOpen(false);
        try { localStorage.setItem(storageKey, '1'); } catch (_) {}
    };

    // Esc to close (desktop QoL)
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    if (!open) return null;
    const cur = STEPS[step];
    const isLast = step === STEPS.length - 1;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 11000,
                background: 'rgba(0,0,0,0.78)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                animation: 'tut-fadein 220ms ease-out',
            }}
            onClick={(e) => {
                // Click backdrop to skip
                if (e.target === e.currentTarget) close();
            }}
        >
            <style>{`
                @keyframes tut-fadein {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                @keyframes tut-stepin {
                    from { opacity: 0; transform: translateY(8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            <div
                style={{
                    maxWidth: 460,
                    width: '100%',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-hot)',
                    clipPath: 'var(--clip-16)',
                    padding: '28px 32px',
                    position: 'relative',
                    animation: 'tut-stepin 240ms ease-out',
                }}
            >
                {/* Stamp header */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontFamily: 'var(--f-mono)',
                        fontSize: 9,
                        color: 'var(--olive)',
                        letterSpacing: '0.22em',
                        marginBottom: 12,
                        textTransform: 'uppercase',
                    }}
                >
                    <span>BRIEFING {step + 1} / {STEPS.length}</span>
                    <span style={{ color: 'var(--accent)' }}>★ {cur.accent}</span>
                    <button
                        onClick={close}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--olive)',
                            fontSize: 13,
                            letterSpacing: '0.2em',
                            cursor: 'pointer',
                            padding: 0,
                        }}
                    >SKIP ✕</button>
                </div>

                {/* Icon */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        marginBottom: 12,
                    }}
                >
                    <Icon name={cur.icon} size={64} color="var(--accent)" />
                </div>

                {/* Title */}
                <div
                    style={{
                        fontFamily: 'var(--f-display)',
                        fontSize: 28,
                        color: 'var(--bone)',
                        letterSpacing: '0.18em',
                        textAlign: 'center',
                        textTransform: 'uppercase',
                        lineHeight: 1.1,
                        marginBottom: 4,
                    }}
                >
                    {cur.title}
                </div>

                {/* Hairline */}
                <div
                    style={{
                        width: 50,
                        height: 1,
                        background: 'var(--accent)',
                        margin: '8px auto 14px',
                    }}
                />

                {/* Body */}
                <div
                    style={{
                        fontFamily: 'var(--f-mono)',
                        fontSize: 12,
                        color: 'var(--olive)',
                        letterSpacing: '0.10em',
                        lineHeight: 1.55,
                        textAlign: 'center',
                        textTransform: 'uppercase',
                        marginBottom: 22,
                    }}
                >
                    {cur.body}
                </div>

                {/* Step dots */}
                <div
                    style={{
                        display: 'flex',
                        gap: 6,
                        justifyContent: 'center',
                        marginBottom: 18,
                    }}
                >
                    {STEPS.map((_, i) => (
                        <span
                            key={i}
                            style={{
                                width: i === step ? 18 : 6,
                                height: 4,
                                background: i === step ? 'var(--accent)' : 'var(--muted)',
                                transition: 'width 160ms, background 160ms',
                            }}
                        />
                    ))}
                </div>

                {/* CTAs */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    {step > 0 && (
                        <CTA kind="ghost" compact onClick={() => setStep(step - 1)}>
                            ◂ BACK
                        </CTA>
                    )}
                    <CTA
                        kind="primary"
                        compact
                        onClick={() => {
                            if (isLast) close();
                            else setStep(step + 1);
                        }}
                    >
                        {isLast ? 'DEPLOY' : 'NEXT ▸'}
                    </CTA>
                </div>
            </div>
        </div>
    );
}
