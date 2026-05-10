import React, { useState, useEffect } from 'react';
import { useTelegram } from '../telegram/TelegramContext';
import { TxToastHost } from './TxToast';
import WelcomeModal from './WelcomeModal';
import TgWebViewBanner from './TgWebViewBanner';
import IosInstallBanner from './IosInstallBanner';
import FeedbackButton from './FeedbackButton';

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

// Width threshold for the "desktop bordered frame" treatment. Anything
// narrower (mobile portrait/landscape, narrow tablets) gets edge-to-
// edge fullscreen instead of the 16:9 bordered look — the aspect-ratio
// constraint at 90dvh used to leave significant dead space on mobile
// (e.g. ~220px of black bars on iPhone landscape).
const DESKTOP_FRAME_MIN_WIDTH = 1024;

const styles = {
  viewport: (isTelegram, tgHeight, isDesktopFrame) => ({
    position: 'relative',
    // - Telegram: fill the viewport (host controls chrome)
    // - Desktop browser (>= 1024px): bordered "CRT monitor" frame at
    //   16:9 aspect ratio, capped at 90dvh to keep a margin around the
    //   border so the framing reads as intentional. Content can be
    //   taller than the frame (e.g. ShopScreen at 100dvh) — we scroll
    //   inside the frame instead of clipping it.
    // - Narrow / mobile: full-bleed 100dvh fullscreen, no aspect-ratio
    //   constraint. Eliminates the ~220px of mobile-landscape dead
    //   space caused by 16:9 + 90dvh on small viewports.
    ...(isTelegram
      ? { width: '100%', height: tgHeight || '100dvh' }
      : isDesktopFrame
        ? { height: '90dvh', aspectRatio: '16 / 9', maxWidth: '100vw', margin: '0 auto' }
        : { width: '100%', height: '100dvh' }
    ),
    background: 'var(--bg-deep)',
    border: isTelegram || !isDesktopFrame ? 'none' : '1px solid var(--border)',
    borderRadius: isTelegram || !isDesktopFrame ? 0 : 4,
    // Mobile-first: hide overflow so Phaser/canvas doesn't paint
    // outside. Desktop frame: also hide here, but the inner content
    // div allows vertical scroll so taller screens (ShopScreen) reveal
    // their bottom controls instead of being clipped at 90dvh.
    overflow: 'hidden',
  }),
  content: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    // Page-level overflow stays hidden on every platform — each screen
    // is responsible for its own internal scroll (e.g. ShopScreen's
    // weapons grid scrolls while the READY footer stays pinned). Page
    // scroll would let the READY button drift below the fold, which
    // is the wrong UX. Screens that need to fill the container should
    // use `height: '100%'` (fit parent), NOT `height: '100dvh'` (forces
    // full viewport, clips inside the desktop 90dvh frame).
    overflow: 'hidden',
  },
};

function Layout({ children }) {
  const { isTelegram, webApp } = useTelegram();
  const [tgHeight, setTgHeight] = useState(null);
  // Track whether the viewport is wide enough for the bordered desktop
  // frame. Update on window resize so device rotation flips treatment
  // (mobile landscape → still mobile, desktop browser narrowing →
  // becomes mobile-style fullscreen, etc.).
  const [isDesktopFrame, setIsDesktopFrame] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= DESKTOP_FRAME_MIN_WIDTH;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => {
      setIsDesktopFrame(window.innerWidth >= DESKTOP_FRAME_MIN_WIDTH);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

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
      {/* iOS-in-TG-WebView detection banner — UA-gated, sessionStorage
          dismiss. Shown above all other UI when applicable. */}
      <TgWebViewBanner />
      {/* iOS Safari (NOT in TG WebView, NOT in dApp browser, NOT already
          standalone) — prompts user to "Add to Home Screen" so the PWA
          launches fullscreen, recovering ~25% of viewport in iPhone
          landscape that's normally lost to URL bar + tab strip. */}
      <IosInstallBanner />
      <DAppBrowserBanner />
      <div data-theme="field" style={styles.viewport(isTelegram, tgHeight, isDesktopFrame)}>
        {/* Design-token overlays — scanlines, grain, vignette */}
        <div className="scanlines" />
        <div className="grain" />
        <div className="vignette" />
        <div style={styles.content}>
          {children}
        </div>
      </div>
      {/* Global toast host — listens for `solshot:toast` window events
          so any screen can fire showToast(...) without prop drilling. */}
      <TxToastHost />
      {/* First-sign-in welcome - fires once when isFreshSignIn flips
          true, prompts the user to fund 0.05 SOL via Apple/Google Pay.
          Self-gates via localStorage so dismiss persists across
          refreshes. */}
      <WelcomeModal />
      {/* Floating feedback / bug-report button (bottom-left). Hidden
          during active battles to avoid overlapping the FIRE button.
          Posts to /api/feedback on the server, writes to Mongo
          Feedback collection for triage. */}
      <FeedbackButton />
    </>
  );
}

export default Layout;
