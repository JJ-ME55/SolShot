import React, { useEffect, useState } from 'react';
import { useSolShotWallet } from '../wallet/WalletContext';

/**
 * DebugAuthOverlay — fixed badge showing the wallet + auth state.
 *
 * Activated by either:
 *   ?debug=1 in the URL (good for short-lived debug sessions), OR
 *   localStorage.solshotDebug === '1' (persistent across reloads;
 *   set with `localStorage.setItem('solshotDebug','1')` in console).
 *
 * Renders a tiny fixed-position card with the wallet adapter's state:
 *   - publicKey present
 *   - wallet connected
 *   - SOL balance
 *   - SIWE-style server auth complete (the actual gate for wagered
 *     queue join — false here = wagered will silently reject)
 *   - last known fatal error
 *
 * Click to dismiss for the current session. Reload to re-show.
 */
function DebugAuthOverlay() {
  const wallet = useSolShotWallet();
  const [enabled, setEnabled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      const fromUrl = qs.get('debug') === '1';
      const fromLs = window.localStorage?.getItem('solshotDebug') === '1';
      setEnabled(fromUrl || fromLs);
    } catch (_) {
      setEnabled(false);
    }
  }, []);

  if (!enabled || dismissed) return null;

  const debug = wallet?.debug || {};
  const source = debug.source || 'legacy';

  // Decide a single high-level status colour so the overlay reads at
  // a glance: green = fully ready, amber = partial, red = blocked.
  const fullyReady = !!wallet?.walletAddress && !!wallet?.isAuthenticated;
  const partialReady = !!wallet?.walletAddress && !wallet?.isAuthenticated;
  const statusColor = fullyReady
    ? '#14F195'
    : partialReady
      ? '#e8a430'
      : '#a83a1a';

  const row = (k, v) => (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: 8,
      padding: '2px 0',
      borderBottom: '1px dashed rgba(120,140,90,0.2)',
    }}>
      <span style={{ color: '#7a9060' }}>{k}</span>
      <span style={{
        color: '#b8d89a',
        fontFamily: "'Share Tech Mono', monospace",
        textAlign: 'right',
        wordBreak: 'break-all',
      }}>{String(v)}</span>
    </div>
  );

  return (
    <div
      onClick={() => setDismissed(true)}
      title="Tap to dismiss"
      style={{
        position: 'fixed',
        top: 'max(48px, env(safe-area-inset-top, 48px))',
        right: 8,
        zIndex: 99999,
        background: 'rgba(8,16,6,0.92)',
        border: `1px solid ${statusColor}`,
        boxShadow: `0 0 14px ${statusColor}55`,
        color: '#b8d89a',
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 10,
        letterSpacing: '0.05em',
        padding: '6px 8px',
        minWidth: 220,
        maxWidth: 'min(340px, 90vw)',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <div style={{
        fontFamily: "'Black Ops One', cursive",
        fontSize: 11,
        color: statusColor,
        letterSpacing: '0.12em',
        marginBottom: 4,
      }}>
        DEBUG · {source.toUpperCase()}
      </div>

      {row('walletAddress', wallet?.walletAddress
        ? `${wallet.walletAddress.slice(0, 6)}…${wallet.walletAddress.slice(-4)}`
        : '— none')}
      {row('isAuthenticated', !!wallet?.isAuthenticated)}
      {row('connected', !!wallet?.connected)}
      {row('balance', (wallet?.balance ?? 0).toFixed(4))}

      {row('hasPublicKey', !!debug.hasPublicKey)}

      {debug.lastError && (
        <div style={{ marginTop: 4, color: '#ff8060' }}>
          ⚠ {debug.lastError}
        </div>
      )}

      <div style={{
        marginTop: 4,
        fontSize: 8,
        color: '#3a4e2a',
        textAlign: 'right',
      }}>
        TAP TO DISMISS
      </div>
    </div>
  );
}

export default DebugAuthOverlay;
