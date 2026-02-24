import React, { useState, useEffect } from 'react';
import { useTelegram } from '../telegram/TelegramContext';

/* dApp browser detection banner — shown when wallet-injected mobile browser locks portrait */
function DAppBrowserBanner() {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Already dismissed this session
    if (sessionStorage.getItem('solshot_dapp_banner_dismissed')) return;

    // Detection: mobile viewport + wallet extension injected + NOT regular Safari
    const isMobile = window.innerWidth < 768 || ('ontouchstart' in window);
    const hasWalletExtension = !!(window.phantom && window.phantom.solana) || !!window.solflare;
    const isRegularSafari = /safari/i.test(navigator.userAgent) && !/chrome/i.test(navigator.userAgent);

    if (isMobile && hasWalletExtension && !isRegularSafari) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const handleDismiss = () => {
    sessionStorage.setItem('solshot_dapp_banner_dismissed', 'true');
    setVisible(false);
  };

  const handleCopyLink = () => {
    try {
      navigator.clipboard.writeText(window.location.href).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } catch (_) {
      // Fallback for browsers without clipboard API
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      background: 'rgba(10, 12, 8, 0.92)',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      padding: '8px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    }}>
      <span style={{
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 11,
        color: '#ccc',
        flex: 1,
        minWidth: 0,
      }}>For the best experience, open solshot.gg in Chrome or Safari</span>
      <button
        onClick={handleCopyLink}
        style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 11,
          color: 'var(--bn, #88ff44)',
          background: 'none',
          border: '1px solid rgba(136,255,68,0.4)',
          borderRadius: 3,
          padding: '3px 8px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >{copied ? 'Copied!' : 'Copy Link'}</button>
      <button
        onClick={handleDismiss}
        style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 11,
          color: '#888',
          background: 'none',
          border: '1px solid rgba(136,136,136,0.3)',
          borderRadius: 3,
          padding: '3px 8px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >Dismiss</button>
    </div>
  );
}

const styles = {
  viewport: (isTelegram, tgHeight) => ({
    position: 'relative',
    // In Telegram: fill the viewport.
    // In browser: fill height, derive width from 16:9 aspect ratio,
    // cap at 100vw so it never overflows horizontally.
    ...(isTelegram
      ? { width: '100%', height: tgHeight || '100vh' }
      : { height: '90vh', aspectRatio: '16 / 9', maxWidth: '100vw' }
    ),
    background: 'linear-gradient(180deg, #0c1008, #0a0c08)',
    border: isTelegram ? 'none' : '1px solid var(--od)',
    borderRadius: isTelegram ? 0 : 4,
    overflow: 'hidden',
    animation: 'fl 5s infinite',
  }),
  noiseOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 100,
    pointerEvents: 'none',
    opacity: 0.03,
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'repeat',
    backgroundSize: '256px 256px',
  },
  scanlineOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 99,
    pointerEvents: 'none',
    background: `repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 0, 0, 0.02) 2px,
      rgba(0, 0, 0, 0.02) 4px
    )`,
  },
  content: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
};

function Layout({ children }) {
  const { isTelegram, webApp } = useTelegram();
  const [tgHeight, setTgHeight] = useState(null);

  // Listen for Telegram viewport changes (keyboard open/close, etc.)
  useEffect(() => {
    if (!isTelegram || !webApp) return;

    // Set initial height
    if (webApp.viewportStableHeight) {
      setTgHeight(webApp.viewportStableHeight + 'px');
    }

    const handleViewport = (event) => {
      // Only resize on stable viewport changes (not during transitions)
      if (event?.isStateStable) {
        setTgHeight(webApp.viewportStableHeight + 'px');
      }
    };

    webApp.onEvent('viewportChanged', handleViewport);
    return () => {
      webApp.offEvent('viewportChanged', handleViewport);
    };
  }, [isTelegram, webApp]);

  return (
    <>
      <DAppBrowserBanner />
      <div style={styles.viewport(isTelegram, tgHeight)}>
        <div style={styles.noiseOverlay} />
        <div style={styles.scanlineOverlay} />
        <div style={styles.content}>
          {children}
        </div>
      </div>
    </>
  );
}

export default Layout;
