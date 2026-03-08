import React, { useState, useEffect, useRef, useCallback } from 'react';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 16,
  },
  shellIcon: {
    width: 40,
    height: 56,
    background: 'var(--sd)',
    border: '2px solid var(--kh)',
    borderRadius: '10px 10px 4px 4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Black Ops One', cursive",
    fontSize: 20,
    color: 'var(--bn)',
    marginBottom: 8,
    animation: 'eg 0.5s ease-out both',
  },
  logoText: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 36,
    letterSpacing: 2,
    animation: 'su 0.4s ease-out 0.2s both',
  },
  barContainer: {
    width: 340,
    height: 8,
    background: 'var(--od)',
    borderRadius: 4,
    overflow: 'hidden',
    border: '1px solid var(--ol)',
    animation: 'su 0.4s ease-out 0.4s both',
  },
  barFill: {
    height: '100%',
    background: 'linear-gradient(90deg, var(--ad), var(--am))',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  },
  statusText: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 18,
    color: 'var(--kh)',
    letterSpacing: 4,
    textTransform: 'uppercase',
    animation: 'su 0.4s ease-out 0.5s both',
  },
  percentText: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 48,
    color: 'var(--bn)',
    animation: 'su 0.4s ease-out 0.45s both',
  },
};

/**
 * Preload Google Fonts used by the design system.
 * Returns a promise that resolves when fonts are ready (or after timeout).
 */
function preloadFonts() {
  return new Promise((resolve) => {
    if (document.fonts && document.fonts.ready) {
      // Wait for fonts to finish loading, but cap at 3s
      const timeout = setTimeout(resolve, 3000);
      document.fonts.ready.then(() => {
        clearTimeout(timeout);
        resolve();
      });
    } else {
      // Fallback: just wait a bit for fonts
      setTimeout(resolve, 1000);
    }
  });
}

/**
 * Verify socket connection is alive (or at least attempted).
 */
function checkSocket() {
  return new Promise((resolve) => {
    const socket = window.socket;
    if (!socket) {
      resolve();
      return;
    }
    if (socket.connected) {
      resolve();
      return;
    }
    // Wait up to 3s for connection
    const timeout = setTimeout(resolve, 3000);
    const onConnect = () => {
      clearTimeout(timeout);
      socket.off('connect', onConnect);
      resolve();
    };
    socket.on('connect', onConnect);
  });
}

/**
 * Preload critical images used by the menu + other screens.
 */
function preloadImages() {
  const urls = [
    'assets/images/wall.png',
    'assets/images/branding/logo-transparent.png',
  ];
  return Promise.all(
    urls.map((src) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve; // don't block on missing images
        img.src = src;
      })
    )
  );
}

function LoadingScreen({ navigate }) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('INITIALIZING...');
  const [logoFailed, setLogoFailed] = useState(false);
  const doneRef = useRef(false);
  const onLogoError = useCallback(() => setLogoFailed(true), []);

  useEffect(() => {
    if (doneRef.current) return;

    let cancelled = false;

    const run = async () => {
      // Step 1: Fonts
      if (cancelled) return;
      setProgress(20);
      setStatus('LOADING ASSETS...');
      await preloadFonts();

      // Step 2: Socket
      if (cancelled) return;
      setProgress(45);
      setStatus('ESTABLISHING COMMS...');
      await checkSocket();

      // Step 3: Images
      if (cancelled) return;
      setProgress(70);
      setStatus('CALIBRATING SYSTEMS...');
      await preloadImages();

      // Step 4: Final
      if (cancelled) return;
      setProgress(90);
      setStatus('ARMING WEAPONS...');
      await new Promise((r) => setTimeout(r, 100));

      // Done
      if (cancelled) return;
      setProgress(100);
      setStatus('READY');
      doneRef.current = true;

      // Brief pause then navigate
      setTimeout(() => {
        if (!cancelled) {
          navigate('menu');
        }
      }, 150);
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div style={styles.container}>
      {/* Logo */}
      {logoFailed ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, animation: 'eg 0.5s ease-out both' }}>
          <span style={{ ...styles.logoText, color: 'var(--bn)' }}>SOL</span>
          <span style={{ ...styles.logoText, color: 'var(--rd)' }}>SHOT</span>
        </div>
      ) : (
        <img
          src="/assets/images/branding/logo-transparent.png"
          alt="SolShot"
          onError={onLogoError}
          style={{ width: 320, height: 'auto', objectFit: 'contain', animation: 'eg 0.5s ease-out both' }}
        />
      )}

      {/* Percentage */}
      <div style={styles.percentText}>{progress}%</div>

      {/* Progress bar */}
      <div style={styles.barContainer}>
        <div style={{ ...styles.barFill, width: `${progress}%` }} />
      </div>

      {/* Status text */}
      <div style={styles.statusText}>{status}</div>
    </div>
  );
}

export default LoadingScreen;
