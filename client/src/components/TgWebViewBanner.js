import React, { useEffect, useState } from 'react';

/**
 * TgWebViewBanner — surfaces the "tap Safari icon for best experience"
 * hint when we detect an iOS user inside Telegram's in-app WebView.
 *
 * Detection heuristics (UA-based, both must match):
 *   1. UA contains "Telegram" — set by TG's WebView when it embeds
 *      pages opened via url:/login_url: buttons. Real Safari does NOT
 *      have this string.
 *   2. UA contains "iPad" or "iPhone" — only iOS has the WebView quirk
 *      where Privy auth may hang vs Safari's full sandbox.
 *
 * On non-iOS or non-TG contexts, returns null and renders nothing.
 *
 * Dismissable per-session via sessionStorage so a user who's already
 * fixed it doesn't see the banner again that session.
 */
const STORAGE_KEY = 'solshot_tg_webview_banner_dismissed';

function detectTgWebViewIos() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isTgWebView = /Telegram/i.test(ua);
  const isIos = /iPad|iPhone|iPod/.test(ua);
  return isTgWebView && isIos;
}

export default function TgWebViewBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(STORAGE_KEY)) return;
    if (!detectTgWebViewIos()) return;
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
      zIndex: 10001, // above WelcomeModal (10000) so it's always reachable
      background: 'rgba(218, 138, 40, 0.98)',
      color: 'var(--bg-deep)',
      borderBottom: '1px solid rgba(0,0,0,0.2)',
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
      fontFamily: 'var(--f-mono)',
      fontSize: 11,
      letterSpacing: '0.05em',
      lineHeight: 1.4,
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ letterSpacing: '0.1em' }}>iOS TIP:</strong>{' '}
        For best play, tap the{' '}
        <strong>compass icon top-right ⌖</strong>{' '}
        to open in Safari. TG's in-app browser may stall on sign-in.
      </span>
      <button
        onClick={dismiss}
        style={{
          background: 'rgba(0,0,0,0.12)',
          color: 'var(--bg-deep)',
          border: '1px solid rgba(0,0,0,0.3)',
          borderRadius: 3,
          padding: '4px 10px',
          fontFamily: 'var(--f-mono)',
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
