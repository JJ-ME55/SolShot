/**
 * EmptyStates — empty / loading / error state primitives.
 *
 * Field-manual aesthetic. Tokens-only. No new fonts. No border-radius.
 * Adapted from the design handoff at IDle/handoff_empty_states.
 *
 * Three primitives:
 *   <EmptyState icon title body primaryCTA secondaryCTA />
 *   <SkeletonRow height lines leftAccent />
 *   <SkeletonCard width height variant />
 *   <ErrorState icon title body primaryCTA secondaryCTA />
 *
 * Sizing:
 *   EmptyState/ErrorState fill their parent (position: absolute, inset: 0)
 *   so they drop straight into any screen-content region without the
 *   caller fighting layout. Wrap them in a `position: relative` parent.
 *
 * Skeletons render at the size you specify — match the real component's
 * footprint so swapping in real data doesn't pop the layout.
 */

import React from 'react';

// ─────────────────────────────────────────────────────────────
// ICON SET — 13 pixel-art SVGs in field-manual style
// All draw on a 24×24 grid with currentColor strokes/fills.
// shape-rendering: crispEdges keeps them on the pixel grid.
// ─────────────────────────────────────────────────────────────
const ICON_VIEWBOX = '0 0 24 24';
const stroke = (extra = {}) => ({
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.25,
    strokeLinecap: 'square',
    strokeLinejoin: 'miter',
    shapeRendering: 'crispEdges',
    ...extra,
});
const px = (extra = {}) => ({ fill: 'currentColor', shapeRendering: 'crispEdges', ...extra });

export const ICONS = {
    radar: (
        <g>
            <circle cx="12" cy="12" r="9" {...stroke()} />
            <circle cx="12" cy="12" r="6" {...stroke({ strokeDasharray: '1 2', opacity: 0.6 })} />
            <circle cx="12" cy="12" r="3" {...stroke({ strokeDasharray: '1 2', opacity: 0.6 })} />
            <line x1="12" y1="3" x2="12" y2="21" {...stroke({ opacity: 0.35 })} />
            <line x1="3" y1="12" x2="21" y2="12" {...stroke({ opacity: 0.35 })} />
            <line x1="12" y1="12" x2="19" y2="6" {...stroke()} />
            <rect x="11" y="11" width="2" height="2" {...px()} />
        </g>
    ),
    reticle: (
        <g>
            <circle cx="12" cy="12" r="8" {...stroke()} />
            <line x1="12" y1="2" x2="12" y2="7" {...stroke()} />
            <line x1="12" y1="17" x2="12" y2="22" {...stroke()} />
            <line x1="2" y1="12" x2="7" y2="12" {...stroke()} />
            <line x1="17" y1="12" x2="22" y2="12" {...stroke()} />
            <rect x="11" y="11" width="2" height="2" {...px()} />
        </g>
    ),
    search: (
        <g>
            <circle cx="10" cy="10" r="6" {...stroke()} />
            <line x1="14.5" y1="14.5" x2="20" y2="20" {...stroke({ strokeWidth: 2 })} />
            <rect x="9" y="9" width="2" height="2" {...px({ opacity: 0.7 })} />
        </g>
    ),
    lock: (
        <g>
            <rect x="5" y="11" width="14" height="9" {...stroke()} />
            <path d="M 8 11 L 8 7 A 4 4 0 0 1 16 7 L 16 11" {...stroke()} />
            <rect x="11" y="14" width="2" height="3" {...px()} />
        </g>
    ),
    target: (
        <g>
            <circle cx="12" cy="12" r="8" {...stroke()} />
            <circle cx="12" cy="12" r="5" {...stroke()} />
            <circle cx="12" cy="12" r="2" {...stroke()} />
            <rect x="11" y="11" width="2" height="2" {...px()} />
        </g>
    ),
    crate: (
        <g>
            <rect x="3" y="6" width="18" height="14" {...stroke()} />
            <line x1="3" y1="11" x2="21" y2="11" {...stroke()} />
            <line x1="9" y1="11" x2="9" y2="20" {...stroke({ opacity: 0.5 })} />
            <line x1="15" y1="11" x2="15" y2="20" {...stroke({ opacity: 0.5 })} />
            <path d="M 7 6 L 12 3 L 17 6" {...stroke()} />
        </g>
    ),
    slots: (
        <g>
            <rect x="3" y="9" width="5" height="6" {...stroke({ strokeDasharray: '2 1.5' })} />
            <rect x="9.5" y="9" width="5" height="6" {...stroke({ strokeDasharray: '2 1.5' })} />
            <rect x="16" y="9" width="5" height="6" {...stroke({ strokeDasharray: '2 1.5' })} />
            <rect x="5" y="11" width="1" height="2" {...px({ opacity: 0.5 })} />
            <rect x="11.5" y="11" width="1" height="2" {...px({ opacity: 0.5 })} />
            <rect x="18" y="11" width="1" height="2" {...px({ opacity: 0.5 })} />
        </g>
    ),
    hourglass: (
        <g>
            <line x1="6" y1="3" x2="18" y2="3" {...stroke({ strokeWidth: 1.5 })} />
            <line x1="6" y1="21" x2="18" y2="21" {...stroke({ strokeWidth: 1.5 })} />
            <path d="M 7 3 L 7 8 L 12 12 L 7 16 L 7 21" {...stroke()} />
            <path d="M 17 3 L 17 8 L 12 12 L 17 16 L 17 21" {...stroke()} />
            <rect x="11" y="11" width="2" height="2" {...px()} />
            <rect x="9" y="18" width="6" height="2" {...px({ opacity: 0.6 })} />
        </g>
    ),
    eye: (
        <g>
            <path d="M 2 12 Q 12 4 22 12 Q 12 20 2 12 Z" {...stroke()} />
            <circle cx="12" cy="12" r="3" {...stroke()} />
            <rect x="11" y="11" width="2" height="2" {...px()} />
        </g>
    ),
    wallet: (
        <g>
            <rect x="3" y="6" width="18" height="13" {...stroke()} />
            <path d="M 3 6 L 17 3 L 17 6" {...stroke()} />
            <rect x="14" y="11" width="7" height="4" {...stroke()} />
            <rect x="17" y="12" width="2" height="2" {...px()} />
        </g>
    ),
    warning: (
        <g>
            <path d="M 12 3 L 22 20 L 2 20 Z" {...stroke({ strokeWidth: 1.5 })} />
            <rect x="11" y="9" width="2" height="6" {...px()} />
            <rect x="11" y="16.5" width="2" height="2" {...px()} />
        </g>
    ),
    txfail: (
        <g>
            <circle cx="12" cy="12" r="9" {...stroke({ strokeDasharray: '2 1.5' })} />
            <line x1="6" y1="6" x2="18" y2="18" {...stroke({ strokeWidth: 2 })} />
            <line x1="18" y1="6" x2="6" y2="18" {...stroke({ strokeWidth: 2 })} />
            <rect x="11" y="11" width="2" height="2" {...px()} />
        </g>
    ),
    skull: (
        <g>
            <path d="M 6 5 L 18 5 L 18 14 L 15 14 L 15 18 L 9 18 L 9 14 L 6 14 Z" {...stroke()} />
            <rect x="9" y="9" width="2" height="2" {...px()} />
            <rect x="13" y="9" width="2" height="2" {...px()} />
            <line x1="11" y1="13" x2="13" y2="13" {...stroke({ opacity: 0.7 })} />
        </g>
    ),
    // compass — horizontal-movement indicator (◂ tank ▸). Used by the
    // MOVE step in the tutorial overlay. Pixel grid keeps it crisp
    // against the field-manual stroke style.
    compass: (
        <g>
            {/* Left arrowhead */}
            <path d="M 6 12 L 9 9 L 9 11 L 11 11 L 11 13 L 9 13 L 9 15 Z" {...stroke()} />
            {/* Right arrowhead */}
            <path d="M 18 12 L 15 9 L 15 11 L 13 11 L 13 13 L 15 13 L 15 15 Z" {...stroke()} />
            {/* Tank silhouette in the middle (turret + body + treads) */}
            <rect x="11" y="14" width="2" height="2" {...px()} />
            <rect x="10" y="16" width="4" height="2" {...stroke()} />
            <rect x="11.25" y="13" width="1.5" height="1.5" {...px({ opacity: 0.6 })} />
            {/* Ground line */}
            <line x1="4" y1="20" x2="20" y2="20" {...stroke({ strokeDasharray: '1.5 1.5', opacity: 0.5 })} />
        </g>
    ),
};

export function Icon({ name, size = 56, color = 'var(--olive)', style = {} }) {
    const I = ICONS[name] || ICONS.radar;
    return (
        <svg width={size} height={size} viewBox={ICON_VIEWBOX} style={{ color, display: 'block', ...style }}>
            {I}
        </svg>
    );
}

// ─────────────────────────────────────────────────────────────
// CTA Buttons — primary (accent), danger (accent), ghost (dashed)
// ─────────────────────────────────────────────────────────────
export function CTA({ kind = 'primary', onClick, children, compact = false, fullWidth = false }) {
    const base = {
        fontFamily: 'var(--f-display)',
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        clipPath: 'var(--clip-10)',
        padding: compact ? '8px 14px' : '11px 18px',
        fontSize: compact ? 11 : 13,
        border: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: fullWidth ? '100%' : 'auto',
        minWidth: 110,
        transition: 'background 0.12s, color 0.12s, transform 0.08s',
    };
    if (kind === 'primary' || kind === 'danger') {
        return (
            <button onClick={onClick} style={{ ...base, background: 'var(--accent)', color: 'var(--bg-deep)' }}>
                {children}
            </button>
        );
    }
    // ghost / secondary — dashed outline
    return (
        <button
            onClick={onClick}
            style={{
                ...base,
                background: 'transparent',
                color: 'var(--olive)',
                border: '1px dashed var(--muted)',
                clipPath: 'var(--clip-6)',
            }}
        >
            {children}
        </button>
    );
}

// ─────────────────────────────────────────────────────────────
// CornerBracket — 4-corner frame around the icon (tactical readout vibe)
// ─────────────────────────────────────────────────────────────
function CornerBracket({ pos, size = 8, color = 'var(--muted)', thickness = 1.5 }) {
    const s = {
        position: 'absolute',
        width: size,
        height: size,
        borderColor: color,
        borderStyle: 'solid',
        borderWidth: 0,
    };
    const e = 0;
    if (pos === 0) return <div style={{ ...s, top: e, left: e, borderTopWidth: thickness, borderLeftWidth: thickness }} />;
    if (pos === 1) return <div style={{ ...s, top: e, right: e, borderTopWidth: thickness, borderRightWidth: thickness }} />;
    if (pos === 2) return <div style={{ ...s, bottom: e, left: e, borderBottomWidth: thickness, borderLeftWidth: thickness }} />;
    return <div style={{ ...s, bottom: e, right: e, borderBottomWidth: thickness, borderRightWidth: thickness }} />;
}

// ─────────────────────────────────────────────────────────────
// EmptyState
// ─────────────────────────────────────────────────────────────
export function EmptyState({
    icon = 'radar',
    iconColor,
    title,
    body,
    primaryCTA,
    secondaryCTA,
    density = 'regular',
    tone = 'default',
    bracketed = true,
}) {
    const compact = density === 'compact';
    const isError = tone === 'error';
    return (
        <div
            style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: compact ? 6 : 10,
                padding: compact ? '20px 24px' : '32px 40px',
                textAlign: 'center',
            }}
        >
            {/* Icon in bracketed frame */}
            <div
                style={{
                    position: 'relative',
                    width: compact ? 64 : 88,
                    height: compact ? 64 : 88,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: compact ? 2 : 6,
                }}
            >
                {bracketed && [0, 1, 2, 3].map(i => (
                    <CornerBracket key={i} pos={i} color={isError ? 'var(--red)' : 'var(--muted)'} />
                ))}
                <Icon
                    name={typeof icon === 'string' ? icon : 'radar'}
                    size={compact ? 36 : 52}
                    color={iconColor || (isError ? 'var(--red)' : 'var(--olive)')}
                />
            </div>

            {/* Title */}
            <div
                style={{
                    fontFamily: 'var(--f-display)',
                    fontSize: compact ? 14 : 17,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: isError ? 'var(--red)' : 'var(--bone)',
                    lineHeight: 1.1,
                }}
            >
                {title}
            </div>

            {/* Hairline divider */}
            <div
                style={{
                    width: compact ? 28 : 40,
                    height: 1,
                    background: 'var(--muted)',
                    opacity: 0.7,
                    margin: '1px 0 2px',
                }}
            />

            {/* Body */}
            {body && (
                <div
                    style={{
                        fontFamily: 'var(--f-mono)',
                        fontSize: compact ? 9 : 11,
                        letterSpacing: '0.12em',
                        color: 'var(--olive)',
                        maxWidth: 340,
                        lineHeight: 1.4,
                        textTransform: 'uppercase',
                    }}
                >
                    {body}
                </div>
            )}

            {/* CTAs */}
            {(primaryCTA || secondaryCTA) && (
                <div
                    style={{
                        display: 'flex',
                        gap: 8,
                        marginTop: compact ? 4 : 10,
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                    }}
                >
                    {primaryCTA && (
                        <CTA kind={isError ? 'danger' : 'primary'} compact={compact} onClick={primaryCTA.onClick}>
                            {primaryCTA.label}
                        </CTA>
                    )}
                    {secondaryCTA && (
                        <CTA kind="ghost" compact={compact} onClick={secondaryCTA.onClick}>
                            {secondaryCTA.label}
                        </CTA>
                    )}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// ErrorState — same chassis, red title + red icon, default RETRY CTA
// ─────────────────────────────────────────────────────────────
export function ErrorState({
    icon = 'txfail',
    title = 'TRANSMISSION FAILURE',
    body = 'COULDN\'T REACH SERVER. CHECK CONNECTION.',
    primaryCTA = { label: 'RETRY' },
    secondaryCTA,
    density = 'regular',
}) {
    return (
        <EmptyState
            icon={icon}
            title={title}
            body={body}
            primaryCTA={primaryCTA}
            secondaryCTA={secondaryCTA}
            density={density}
            tone="error"
        />
    );
}

// ─────────────────────────────────────────────────────────────
// SkeletonRow — pulsing dashed-border bar matching real-content row height
// ─────────────────────────────────────────────────────────────
export function SkeletonRow({ height = 32, lines = 2, leftAccent = false, style = {} }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                height,
                padding: '0 8px',
                background: 'var(--bg-deep)',
                borderTop: '1px dashed var(--muted)',
                borderBottom: '1px dashed var(--muted)',
                borderLeft: leftAccent ? '3px solid var(--muted)' : '1px dashed var(--muted)',
                borderRight: '1px dashed var(--muted)',
                animation: 'es-pulse 1s ease-in-out infinite',
                ...style,
            }}
        >
            <div
                style={{
                    width: height - 10,
                    height: height - 10,
                    border: '1px dashed var(--muted)',
                    flex: '0 0 auto',
                }}
            />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {Array.from({ length: lines }).map((_, i) => (
                    <div
                        key={i}
                        style={{
                            height: i === 0 ? Math.max(7, (height - 12) / Math.max(2, lines)) : 5,
                            width: i === 0 ? '62%' : '38%',
                            background: 'var(--muted)',
                            opacity: 0.45,
                        }}
                    />
                ))}
            </div>
            <div style={{ width: 28, height: 8, background: 'var(--muted)', opacity: 0.45, flex: '0 0 auto' }} />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// SkeletonCard — pulsing dashed box matching a card's footprint
// ─────────────────────────────────────────────────────────────
export function SkeletonCard({ width, height, variant = 'tile', style = {} }) {
    return (
        <div
            style={{
                width,
                height,
                background: 'var(--bg-deep)',
                border: '1px dashed var(--muted)',
                clipPath: 'var(--clip-6)',
                padding: 8,
                animation: 'es-pulse 1s ease-in-out infinite',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                ...style,
            }}
        >
            {variant === 'stat' && (
                <>
                    <div style={{ height: 6, width: '40%', background: 'var(--muted)', opacity: 0.45 }} />
                    <div style={{ height: 18, width: '60%', background: 'var(--muted)', opacity: 0.55, marginTop: 2 }} />
                </>
            )}
            {variant === 'tile' && (
                <>
                    <div style={{ flex: 1, background: 'var(--muted)', opacity: 0.25, border: '1px dashed var(--muted)' }} />
                    <div style={{ height: 5, width: '55%', background: 'var(--muted)', opacity: 0.45 }} />
                    <div style={{ height: 4, width: '30%', background: 'var(--muted)', opacity: 0.35 }} />
                </>
            )}
            {variant === 'hero' && (
                <>
                    <div style={{ height: 8, width: '30%', background: 'var(--muted)', opacity: 0.45 }} />
                    <div style={{ flex: 1, background: 'var(--muted)', opacity: 0.2, border: '1px dashed var(--muted)' }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--muted)', opacity: 0.45 }} />
                        <div style={{ flex: 1, height: 6, background: 'var(--muted)', opacity: 0.35 }} />
                    </div>
                </>
            )}
        </div>
    );
}

// One-time pulse keyframes injection (idempotent across module re-imports)
if (typeof document !== 'undefined' && !document.getElementById('es-pulse-css')) {
    const s = document.createElement('style');
    s.id = 'es-pulse-css';
    s.textContent = `
        @keyframes es-pulse {
            0%, 100% { opacity: 0.55; }
            50%      { opacity: 0.9; }
        }
    `;
    document.head.appendChild(s);
}

// Default export for convenience — most callers import { EmptyState, ... }
export default { EmptyState, ErrorState, SkeletonRow, SkeletonCard, Icon, CTA, ICONS };
