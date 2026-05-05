import React, { useEffect, useState } from 'react';

/**
 * IosInstallBanner — surfaces a one-tap "Add to Home Screen" hint for
 * iOS Safari users so they can launch SolShot fullscreen (no URL bar /
 * tab strip / nav arrows eating ~25% of viewport in landscape).
 *
 * Shown when ALL of:
 *   1. UA matches iPhone / iPad / iPod (or iPad-as-Mac via maxTouchPoints)
 *   2. Not already in standalone mode (navigator.standalone is true on iOS
 *      when launched from Home Screen)
 *   3. Not inside Telegram's WebView (TgWebViewBanner handles that case)
 *   4. Not inside a dApp browser (Phantom/Solflare in-app browsers inject
 *      window.phantom / window.solflare — DAppBrowserBanner handles those)
 *   5. Not dismissed this session (sessionStorage flag)
 *
 * The actual install action requires the user to tap Share → Add to Home
 * Screen — there's no programmatic install API on iOS Safari. We show a
 * compact banner with the share-icon glyph + instructions.
 *
 * Once installed and launched from the Home Screen, the
 * apple-mobile-web-app-capable=yes meta tag in index.html flips the WebView
 * into fullscreen mode and the banner self-suppresses (navigator.standalone
 * = true).
 */
const STORAGE_KEY = 'solshot_ios_install_banner_dismissed';

function detectIosSafariNonStandalone() {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
    const ua = navigator.userAgent || '';

    // iPhone / iPad / iPod direct match
    const directIos = /iPhone|iPad|iPod/.test(ua);

    // iPad on iPadOS 13+ identifies as Mac. Heuristic: macOS UA + touch points.
    const ipadAsMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;

    const isIos = directIos || ipadAsMac;
    if (!isIos) return false;

    // Already running standalone? No need to show.
    // navigator.standalone is iOS-specific and true when launched from Home Screen.
    if (window.navigator.standalone === true) return false;
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return false;

    // Inside Telegram WebView — TgWebViewBanner handles that case with its
    // own Safari hint, don't double up.
    if (/Telegram/i.test(ua)) return false;

    // Inside Phantom / Solflare / other wallet-injected browser —
    // DAppBrowserBanner handles those. Detect via injected globals
    // (matches DAppBrowserBanner's heuristic).
    if (window.phantom?.solana || window.solflare) return false;

    return true;
}

export default function IosInstallBanner() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            if (sessionStorage.getItem(STORAGE_KEY)) return;
        } catch (_) { /* sessionStorage unavailable — fall through and show */ }
        if (!detectIosSafariNonStandalone()) return;
        setShow(true);
    }, []);

    if (!show) return null;

    const dismiss = () => {
        try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch (_) {}
        setShow(false);
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            // Above WelcomeModal (10000) and TgWebViewBanner (10001).
            // Distinct from those because they suppress this one mutually,
            // but if both heuristics ever overlap we want the iOS hint
            // visible last so the user reads the most relevant fix.
            zIndex: 10002,
            background: 'rgba(20, 24, 12, 0.97)',
            color: 'var(--bone, #e8e4d0)',
            borderBottom: '1px solid rgba(136,255,68,0.25)',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            fontFamily: 'var(--f-mono, "Share Tech Mono", monospace)',
            fontSize: 11,
            letterSpacing: '0.05em',
            lineHeight: 1.4,
        }}>
            <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ color: 'var(--bn, #88ff44)', letterSpacing: '0.1em' }}>FULLSCREEN TIP:</strong>{' '}
                Tap{' '}
                {/* Inline SVG of the iOS share icon — square with up-arrow.
                    Drawn so it scales with font-size, no PNG dependency. */}
                <svg
                    aria-label="Share"
                    role="img"
                    width="11"
                    height="13"
                    viewBox="0 0 16 20"
                    style={{ verticalAlign: '-2px', display: 'inline-block' }}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                >
                    <path d="M8 13V2M5 5l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
                    <rect x="2" y="8" width="12" height="11" rx="1.5" />
                </svg>
                {' '}<strong>Share</strong> → <strong>Add to Home Screen</strong> for true fullscreen (no URL bar).
            </span>
            <button
                onClick={dismiss}
                style={{
                    background: 'rgba(136,255,68,0.08)',
                    color: 'var(--bone, #e8e4d0)',
                    border: '1px solid rgba(136,255,68,0.3)',
                    borderRadius: 3,
                    padding: '4px 10px',
                    fontFamily: 'var(--f-mono, monospace)',
                    fontSize: 10,
                    letterSpacing: '0.15em',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                }}
            >
                DISMISS
            </button>
        </div>
    );
}
