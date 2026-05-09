import React, { useEffect, useRef, useState } from 'react';
import { useSolShotWallet } from '../../wallet/WalletContext';
import useIsMobile from '../../hooks/useIsMobile';

/**
 * DesignTopBar — header used on Menu + similar hero screens.
 *
 * Right-side cluster shows different things depending on wallet state:
 *   - Disconnected: SIGN IN button that opens Privy's modal (email or
 *     Telegram login → embedded Solana wallet provisioned silently).
 *   - Connected: SHOT + SOL balances, plus an address pill + chevron menu
 *     - Single-tap pill: copy address (still works, fast path)
 *     - Tap chevron: menu with Copy / Add SOL / Manage / Sign Out and
 *       (when needed) a "Secure your account" recovery prompt.
 *
 * Privy is the single sign-in path. The wallet-adapter (Phantom/Solflare
 * extension auto-connect) was stripped to simplify UX to a two-button
 * sign-in: Email or Telegram.
 */
export default function DesignTopBar({
  callsign = 'OPERATIVE',
  tier = 'UNRANKED',
  level = 1,
  shotBalance = 0,
  solBalance = 0,
  badgeSrc,
}) {
  const {
    walletAddress,
    connected,
    login,
    logout,
    openPrivyAccount,
    fundWallet,
    recoveryStatus,
    linkEmailRecovery,
    linkTelegramRecovery,
  } = useSolShotWallet();
  const isMobile = useIsMobile();
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleConnect = () => {
    if (login) login();
  };

  const handlePillClick = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      // Clipboard unavailable — fall through silently
    }
  };

  // Menu actions
  const doCopy = async () => {
    setMenuOpen(false);
    await handlePillClick();
  };
  const doFund = async () => {
    setMenuOpen(false);
    if (fundWallet) await fundWallet({ amount: '0.05' });
  };
  const doManage = async () => {
    setMenuOpen(false);
    if (openPrivyAccount) await openPrivyAccount();
  };
  const doSignOut = async () => {
    setMenuOpen(false);
    if (logout) await logout();
  };
  const doLinkEmail = async () => {
    setMenuOpen(false);
    if (linkEmailRecovery) await linkEmailRecovery();
  };
  const doLinkTelegram = async () => {
    setMenuOpen(false);
    if (linkTelegramRecovery) await linkTelegramRecovery();
  };

  const addrShort = walletAddress
    ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`
    : null;

  // Menu item style helper — keeps the loop below readable
  const menuItemStyle = (highlight = false) => ({
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '8px 12px',
    background: highlight ? 'rgba(255, 178, 0, 0.08)' : 'transparent',
    border: 'none',
    borderBottom: '1px solid var(--border)',
    color: highlight ? 'var(--accent)' : 'var(--bone)',
    fontFamily: 'var(--f-mono)',
    fontSize: 10,
    letterSpacing: '0.18em',
    cursor: 'pointer',
    transition: 'background 0.1s',
  });

  // Mobile landscape phone (390px tall): the desktop padding 14/28 +
  // wordmark fontSize 38 eats ~60px of header. Halve everything for
  // mobile so the rest of the screen has breathing room.
  //
  // QA pass May 9: top bar text was reading as muted/cramped against
  // Safari's URL bar on iPhone. Brightened the dim text colours
  // (callsign now full bone with subtle text-shadow, tier line moved
  // from --olive to a brighter mid-tone for legibility), bumped the
  // mobile vertical padding from 6px to 12px so the wordmark and side
  // chips have visible breathing room from the chrome above. Scoped
  // to TopBar only so we don't touch text colours globally.
  return (
    <div style={{
      position: 'relative', zIndex: 3,
      display: 'grid', gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center',
      padding: isMobile ? '20px 12px 10px' : '14px 28px',
      borderBottom: '1px solid var(--border)',
      // Hard 20px floor on mobile padding-top so there's a visible gap
      // between Safari's URL bar and the wordmark even in landscape
      // (where env(safe-area-inset-top) resolves to 0). JJ QA: top of D
      // in "Demon" was being swallowed by the URL bar — needed
      // noticeable background line between the chrome and our header.
      paddingTop: isMobile ? 'max(20px, env(safe-area-inset-top, 0px))' : '14px',
    }}>
      <div style={{ justifySelf: 'start', display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10 }}>
        {badgeSrc && (
          <img
            src={badgeSrc}
            style={{
              width: isMobile ? 22 : 28,
              height: isMobile ? 22 : 28,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
            }}
            alt="rank"
          />
        )}
        <div>
          <div style={{
            fontFamily: 'var(--f-sec)',
            fontSize: isMobile ? 11 : 13,
            color: 'var(--bone)',
            letterSpacing: '0.1em',
            lineHeight: 1.25,
            paddingBottom: 1,
            textShadow: '0 1px 2px rgba(0,0,0,0.6)',
          }}>{callsign}</div>
          <div style={{
            fontFamily: 'var(--f-mono)',
            fontSize: isMobile ? 8 : 9,
            // Brighter than --olive so tier+level reads cleanly against
            // dark BG — was getting lost on iPhone landscape.
            color: 'rgba(196,166,93,0.85)',
            letterSpacing: '0.2em',
            lineHeight: 1.3,
          }}>{tier} · LVL {level}</div>
        </div>
      </div>
      <div style={{
        fontFamily: 'var(--f-display)',
        // Bumped mobile size from 18 → 22 so the wordmark stops feeling
        // squished against the URL bar. Subtle text-shadow gives it
        // depth against varied backgrounds. JJ QA pass May 9.
        fontSize: isMobile ? 22 : 38,
        letterSpacing: '0.04em', lineHeight: 1.1, userSelect: 'none',
        textShadow: '0 1px 3px rgba(0,0,0,0.7)',
      }}>
        <span style={{ color: 'var(--bone)' }}>SOL</span>
        <span style={{ color: 'var(--accent)' }}>SHOT</span>
      </div>
      <div style={{
        justifySelf: 'end',
        display: 'flex', alignItems: 'center',
        gap: isMobile ? 6 : 10,
        fontFamily: 'var(--f-mono)',
        fontSize: isMobile ? 10 : 11,
        letterSpacing: '0.15em',
      }}>
        {connected ? (
          <>
            <span style={{ color: 'var(--accent)' }}>&#9670; {shotBalance.toLocaleString()} SHOT</span>
            <span style={{ color: 'var(--bone)' }}>&#9671; {solBalance.toFixed(2)} SOL</span>
            <div ref={menuRef} style={{ position: 'relative', display: 'flex', alignItems: 'stretch', gap: 0 }}>
              <button
                type="button"
                onClick={handlePillClick}
                title={`${walletAddress}\n\nClick to copy · Open menu →`}
                style={{
                  fontFamily: 'var(--f-mono)',
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  background: copied ? 'var(--accent)' : 'var(--bg-raised)',
                  color: copied ? 'var(--bg-deep)' : 'var(--olive)',
                  border: '1px solid var(--border)',
                  borderRight: 'none',
                  padding: '5px 9px',
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {copied ? 'COPIED' : addrShort}
              </button>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                title="Wallet menu"
                aria-label="Open wallet menu"
                style={{
                  fontFamily: 'var(--f-mono)',
                  fontSize: 10,
                  background: menuOpen ? 'var(--accent)' : 'var(--bg-raised)',
                  color: menuOpen ? 'var(--bg-deep)' : 'var(--olive)',
                  border: '1px solid var(--border)',
                  padding: '5px 7px',
                  cursor: 'pointer',
                  clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {menuOpen ? '▴' : '▾'}
              </button>
              {menuOpen && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  minWidth: 200,
                  background: 'var(--bg-raised)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 6px 24px rgba(0, 0, 0, 0.5)',
                  zIndex: 100,
                  // Non-clipped corners — clip only outer container
                  clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
                }}>
                  {recoveryStatus?.needsRecovery && (
                    <>
                      {!recoveryStatus.hasEmail && (
                        <button type="button" onClick={doLinkEmail} style={menuItemStyle(true)}>
                          ⚠ ADD EMAIL BACKUP
                        </button>
                      )}
                      {!recoveryStatus.hasTelegram && (
                        <button type="button" onClick={doLinkTelegram} style={menuItemStyle(true)}>
                          ⚠ ADD TELEGRAM BACKUP
                        </button>
                      )}
                    </>
                  )}
                  <button type="button" onClick={doCopy} style={menuItemStyle()}>
                    COPY ADDRESS
                  </button>
                  <button type="button" onClick={doFund} style={menuItemStyle()}>
                    + ADD SOL
                  </button>
                  <button type="button" onClick={doManage} style={menuItemStyle()}>
                    EXPORT KEY
                  </button>
                  <button
                    type="button"
                    onClick={doSignOut}
                    style={{ ...menuItemStyle(), borderBottom: 'none', color: 'var(--olive)' }}
                  >
                    SIGN OUT
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            style={{
              fontFamily: 'var(--f-display)',
              fontSize: 12,
              letterSpacing: '0.18em',
              background: 'var(--accent)',
              color: 'var(--bg-deep)',
              border: 'none',
              padding: '8px 14px',
              cursor: 'pointer',
              clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
            }}
          >
            SIGN IN
          </button>
        )}
      </div>
    </div>
  );
}
