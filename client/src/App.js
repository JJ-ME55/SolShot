import './styles/tokens.css';
import React, { useState, useCallback, useEffect, Suspense, lazy } from 'react';
import { socket } from './socket/index';
import './utils/haptic';
import FAQ from './components/FAQ';
import { SolShotWalletProvider } from './wallet/WalletContext';
import { TelegramProvider } from './telegram/TelegramContext';
import useTelegramBackButton from './telegram/useTelegramBackButton';
import Layout from './components/Layout';
// Eager — always reachable, no benefit to splitting
import LoadingScreen from './screens/LoadingScreen';
import MenuScreen from './screens/MenuScreen';
import HandleModal from './components/HandleModal';
import DebugAuthOverlay from './components/DebugAuthOverlay';
import { useTelegram } from './telegram/TelegramContext';
import { useSolShotWallet } from './wallet/WalletContext';

// Lazy — split into separate chunks (huge Phaser deps live in BattleScreen/AIPracticeScreen)
const LobbyScreen          = lazy(() => import('./screens/LobbyScreen'));
const ShopScreen           = lazy(() => import('./screens/ShopScreen'));
const BattleScreen         = lazy(() => import('./screens/BattleScreen'));
const WinScreen            = lazy(() => import('./screens/WinScreen'));
const LoseScreen           = lazy(() => import('./screens/LoseScreen'));
const ArmoryScreen         = lazy(() => import('./screens/ArmoryScreen'));
const PrestigeScreen       = lazy(() => import('./screens/PrestigeScreen'));
const BarracksScreen       = lazy(() => import('./screens/BarracksScreen'));
const AIPracticeScreen     = lazy(() => import('./screens/AIPracticeScreen'));
const LoadoutScreen        = lazy(() => import('./screens/LoadoutScreen'));
const HowToPlayScreen      = lazy(() => import('./screens/HowToPlayScreen'));
const TermsScreen          = lazy(() => import('./screens/TermsScreen'));
const PrivacyScreen        = lazy(() => import('./screens/PrivacyScreen'));
const ChallengeAcceptScreen = lazy(() => import('./screens/ChallengeAcceptScreen'));
const GroupMatchScreen     = lazy(() => import('./screens/GroupMatchScreen'));
const GroupDepositScreen   = lazy(() => import('./screens/GroupDepositScreen'));
const MyGamesScreen        = lazy(() => import('./screens/MyGamesScreen'));

/** Minimal fallback shown while a lazy-loaded screen chunk is fetching. */
function ScreenFallback() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-deep, #0e1209)',
      fontFamily: 'var(--f-mono)',
      fontSize: 11,
      color: 'var(--olive, #7a9060)',
      letterSpacing: '0.22em',
    }}>
      LOADING...
    </div>
  );
}

// A8: Socket bridge for Phaser scenes — non-enumerable to reduce XSS discovery surface
Object.defineProperty(window, 'socket', {
  value: socket,
  writable: false,
  enumerable: false,
  configurable: false,
});

function AppInner() {
  const [screen, setScreen] = useState('loading');
  const [screenData, setScreenData] = useState({});
  const [faqOpen, setFaqOpen] = useState(false);

  const { isTelegram, user: tgUser, startParam } = useTelegram();
  // walletHandle comes from server after auth and is the authoritative
  // callsign for this wallet (locked once set). When present, we sync
  // it into App's `handle` state so HandleModal doesn't re-prompt.
  const { walletHandle, setWalletHandle: persistWalletHandle, walletAddress, stableUid } = useSolShotWallet();

  // Identity policy A — TG username is canonical (TG users only).
  // Browser/email users now use the WALLET-anchored handle from server
  // (walletHandle.handle, persisted via setWalletHandle). The localStorage
  // `solshot_handle` value is kept as a transient cache for legacy
  // call-sites; WalletContext mirrors the server-canonical value into
  // localStorage on every walletHandle event so they stay in sync.
  const [handle, setHandle] = useState(() => {
    const stored = localStorage.getItem('solshot_handle');
    if (stored) return stored;
    return null;
  });

  // Sync server-canonical wallet handle into local state. Once the
  // server confirms a handle, it's locked — HandleModal won't re-show.
  useEffect(() => {
    if (walletHandle?.handle && walletHandle.handle !== handle) {
      setHandle(walletHandle.handle);
    }
  }, [walletHandle, handle]);

  // Auto-migrate: if wallet just connected and the server reports no
  // handle yet but the user has a localStorage handle from a previous
  // session (or another browser), push it to the server to lock it in.
  // This means returning users keep their existing callsign without a
  // re-pick, and once persisted server-side, all future logins on any
  // device pick up the same name.
  useEffect(() => {
    if (!walletAddress) return;
    if (!persistWalletHandle) return;
    if (walletHandle?.locked) return; // already set, nothing to do
    if (walletHandle?.handle === undefined) return; // server hasn't replied yet
    // walletHandle.handle is null (server says no persisted handle)
    if (walletHandle?.handle !== null) return;
    const localHandle = localStorage.getItem('solshot_handle');
    if (!localHandle) return;
    persistWalletHandle(localHandle);
  }, [walletAddress, walletHandle, persistWalletHandle]);

  useEffect(() => {
    if (!isTelegram || !tgUser) return;
    const tgHandle = tgUser.username || tgUser.first_name || 'TG_Player';
    const uid = 'tg_' + (tgUser.id || Date.now());
    // Always overwrite — TG username wins. Any saved override is dropped.
    if (handle !== tgHandle) {
      localStorage.setItem('solshot_handle', tgHandle);
      localStorage.setItem('solshot_uid', uid);
      setHandle(tgHandle);
    }
    if (window.socket?.connected) {
      window.socket.emit('registerIdentity', { uid, handle: tgHandle });
    }
  }, [isTelegram, tgUser, handle]);

  const handleHandleComplete = useCallback((h, uid) => {
    setHandle(h);
    if (window.socket?.connected) {
      window.socket.emit('registerIdentity', { uid, handle: h });
    }
    // If wallet is connected and no handle yet locked, persist the
    // chosen callsign server-side keyed by walletAddress (one-time set).
    // This is the source of truth for the wallet's display name across
    // sessions/devices — localStorage is just a cache.
    if (walletAddress && !walletHandle?.locked && persistWalletHandle) {
      persistWalletHandle(h);
    }
  }, [walletAddress, walletHandle, persistWalletHandle]);

  // Phase 28: Send practice identity to server on socket connect.
  //
  // Identity priority (orphan-account fix, 2026-05-10):
  //   1. stableUid from Privy (`tg_<id>` for TG-linked, `did:privy:…` for
  //      email-only) — deterministic per Privy account, survives cache
  //      clears.
  //   2. localStorage `solshot_uid` — cached from a prior session.
  //   3. Skip — no identity yet.
  //
  // Previously this used localStorage exclusively, which spawned orphan
  // User docs whenever a returning user's localStorage was cleared (new
  // browser, incognito, cache wipe). Fish ended up with 4 User docs
  // because of that pattern.
  useEffect(() => {
    const sock = window.socket;
    if (!sock) return;
    const sendIdentity = () => {
      const uid = stableUid || localStorage.getItem('solshot_uid');
      const h = localStorage.getItem('solshot_handle');
      if (uid) {
        // Sync the stable uid back to localStorage so legacy code paths
        // that still read solshot_uid stay consistent.
        if (stableUid) localStorage.setItem('solshot_uid', stableUid);
        sock.emit('registerIdentity', { uid, handle: h });
      }
    };
    sock.on('connect', sendIdentity);
    if (sock.connected) sendIdentity();
    return () => sock.off('connect', sendIdentity);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableUid]);

  // Telegram deep link routing.
  // startapp=<param> arrives in start_param. Bot commands send these:
  //   join_<roomId>     → auto-join an existing match
  //   ch_<challengeId>  → accept a challenge (Phase 3 — not yet wired)
  //   rf_<wallet>       → referral attribution (Phase 4 — not yet wired)
  //   play              → menu / lobby
  //   stats             → barracks (combat record)
  //   leaderboard       → barracks (leaderboard tab)
  //   wallet            → barracks (wallet info in top bar)
  //   shop              → armory (cosmetic shop)
  //   prestige          → prestige screen
  //   weapons           → armory (browse arsenal)
  //   challenge         → lobby (challenge builder; Phase 3 wires a dedicated screen)
  useEffect(() => {
    if (!startParam) return;
    const sock = window.socket;

    // Match the startapp prefix or exact value
    if (startParam.startsWith('join_')) {
      const roomId = startParam.slice(5);
      if (!roomId || !sock) return;
      const tryJoin = () => {
        setScreenData({ autoJoinRoomId: roomId });
        setScreen('lobby');
      };
      if (sock.connected) tryJoin();
      else sock.once('connect', tryJoin);
      return;
    }

    if (startParam.startsWith('ch_')) {
      // Challenge accept deep link: ch_<5-char-shortCode>
      const challengeCode = startParam.slice(3);
      if (!challengeCode) return;
      setScreenData({ challengeCode });
      setScreen('challengeAccept');
      return;
    }

    if (startParam.startsWith('rf_')) {
      // Referral attribution: rf_<6-hex-referralCode>
      // Fire-and-forget — server attributes silently on first match completion.
      // We don't gate any UI on this; the referee just plays normally and gets
      // their reward + the inviter gets theirs once they complete a wagered match.
      const code = startParam.slice(3).toUpperCase();
      if (!code || !sock) return;
      const fire = () => sock.emit('attributeReferrer', { code });
      if (sock.connected) fire();
      else sock.once('connect', fire);
      // Don't return — fall through so a following routes match still works
      //   (e.g. someone could deep-link a referral straight into the lobby).
      // For now no second prefix is handled, but leaving the architecture open.
    }

    if (startParam === 'challenge_new') {
      // Challenger landed via /challenge bot command — auto-fire challenge create
      // in the lobby on mount.
      setScreenData({ autoCreateChallenge: true });
      setScreen('lobby');
      return;
    }

    // Group-chat match deep links (Phase 1c).
    //   lobby_<matchId>    — wagered-mode join after deposit; routes to detail view
    //   match_<matchId>    — active-or-settled match; same screen, renders by state
    //   deposit_<matchId>  — wagered match in awaiting_deposits state; deposit screen
    if (startParam.startsWith('deposit_')) {
      const matchId = startParam.slice('deposit_'.length);
      if (matchId) {
        setScreenData({ groupMatchId: matchId });
        setScreen('group-deposit');
      }
      return;
    }
    if (startParam.startsWith('lobby_') || startParam.startsWith('match_')) {
      const matchId = startParam.slice(startParam.indexOf('_') + 1);
      if (matchId) {
        setScreenData({ groupMatchId: matchId });
        setScreen('group-match');
      }
      return;
    }

    // Direct screen routing — these are exact-match deep links from bot commands
    const routes = {
      play:        'lobby',
      challenge:   'lobby',
      stats:       'barracks',
      leaderboard: 'barracks',
      wallet:      'barracks',
      shop:        'armory',
      weapons:     'armory',
      prestige:    'prestige',
      settings:    'barracks',  // No dedicated settings screen yet — barracks has callsign + wallet info
      mygames:     'mygames',   // Group-chat multi-match home (Phase 1 polish)
    };
    const target = routes[startParam];
    if (target) {
      setScreen(target);
    }
    // Unknown / unhandled startParams (ch_*, rf_*, etc.) fall through to default menu.
    // Wire those when the corresponding feature lands.
  }, [startParam]);

  // Navigate between screens — spread copy to avoid stale refs
  const navigate = useCallback((nextScreen, data = {}) => {
    setScreenData({ ...data });
    setScreen(nextScreen);
  }, []);

  // Loading-screen-specific navigate. Functional setState reads the LATEST
  // screen value, so if a deep-link useEffect (startParam) has already moved
  // us off 'loading', we don't override it with 'menu'.
  const navigateFromLoading = useCallback((nextScreen, data = {}) => {
    setScreen((curr) => {
      if (curr !== 'loading') return curr; // deep link already routed — preserve it
      setScreenData({ ...data });
      return nextScreen;
    });
  }, []);

  // Reconnect/rejoin disabled for P1 launch — causes more issues than it solves

  // Telegram native back button integration
  const handleTelegramBack = useCallback(() => {
    navigate('menu');
  }, [navigate]);

  useTelegramBackButton(screen, handleTelegramBack);

  const renderScreen = () => {
    // Eager screens render directly (no Suspense overhead).
    if (screen === 'loading') return <LoadingScreen navigate={navigateFromLoading} />;
    if (screen === 'menu')    return <MenuScreen navigate={navigate} />;

    // All other screens are code-split — wrap in Suspense.
    return (
      <Suspense fallback={<ScreenFallback />}>
        {(() => {
          switch (screen) {
            case 'lobby':       return <LobbyScreen navigate={navigate} screenData={screenData} />;
            case 'shop':        return <ShopScreen navigate={navigate} screenData={screenData} />;
            case 'battle':      return <BattleScreen navigate={navigate} screenData={screenData} />;
            case 'win':         return <WinScreen navigate={navigate} screenData={screenData} />;
            case 'lose':        return <LoseScreen navigate={navigate} screenData={screenData} />;
            case 'armory':      return <ArmoryScreen navigate={navigate} />;
            case 'prestige':    return <PrestigeScreen navigate={navigate} />;
            case 'barracks':    return <BarracksScreen navigate={navigate} />;
            case 'ai-practice': return <AIPracticeScreen navigate={navigate} />;
            case 'loadout':     return <LoadoutScreen navigate={navigate} />;
            case 'howtoplay':   return <HowToPlayScreen navigate={navigate} />;
            case 'terms':       return <TermsScreen navigate={navigate} />;
            case 'privacy':     return <PrivacyScreen navigate={navigate} />;
            case 'challengeAccept': return <ChallengeAcceptScreen navigate={navigate} screenData={screenData} />;
            case 'group-match': return <GroupMatchScreen navigate={navigate} screenData={screenData} />;
            case 'group-deposit': return <GroupDepositScreen navigate={navigate} screenData={screenData} />;
            case 'mygames':     return <MyGamesScreen navigate={navigate} />;
            default:            return <MenuScreen navigate={navigate} />;
          }
        })()}
      </Suspense>
    );
  };

  return (
    <Layout>
      {renderScreen()}
      {!handle && screen !== 'loading' && (
        <HandleModal onComplete={handleHandleComplete} />
      )}
      <PortraitWarning />
      {/* H031 fix — only render DebugAuthOverlay in non-production builds.
          Previously it shipped in the production bundle and was activated
          via `?debug=1` URL param, exposing live auth state + balance to
          any user. */}
      {process.env.NODE_ENV !== 'production' && <DebugAuthOverlay />}
      {/* Hide FAQ button during battle/shop to avoid cluttering gameplay */}
      {screen !== 'battle' && screen !== 'shop' && (
        <button
          onClick={() => setFaqOpen(true)}
          aria-label="Open FAQ"
          style={{
            position: 'fixed',
            bottom: 12,
            right: 12,
            zIndex: 9000,
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'rgba(10, 12, 8, 0.85)',
            border: '1px solid var(--ol)',
            color: '#fff',
            fontFamily: "'Black Ops One', cursive",
            fontSize: 18,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
        >?</button>
      )}
      <FAQ isOpen={faqOpen} onClose={() => setFaqOpen(false)} />
    </Layout>
  );
}

/* Rotate-to-landscape overlay for mobile portrait */
function PortraitWarning() {
  const [isPortrait, setIsPortrait] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const check = () => {
      // Only show on mobile-sized screens (< 768px wide) in portrait
      const mobile = window.innerWidth < 768;
      const portrait = window.innerHeight > window.innerWidth;
      setIsPortrait(mobile && portrait);
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', () => setTimeout(check, 100));
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  // Check sessionStorage on mount — if user dismissed earlier this session, skip
  useEffect(() => {
    if (sessionStorage.getItem('solshot_portrait_dismissed')) {
      setDismissed(true);
    }
  }, []);

  if (!isPortrait || dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem('solshot_portrait_dismissed', 'true');
    setDismissed(true);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(10, 12, 8, 0.95)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
    }}>
      <div style={{
        fontSize: 48, transform: 'rotate(90deg)',
        transition: 'transform 1s ease',
        animation: 'rotateHint 2s ease-in-out infinite',
      }}>📱</div>
      <div style={{
        fontFamily: "'Black Ops One', cursive",
        fontSize: 18, color: 'var(--bn)',
        letterSpacing: 3, textAlign: 'center',
      }}>ROTATE TO LANDSCAPE</div>
      <div style={{
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 12, color: 'var(--kh)',
        textAlign: 'center', opacity: 0.6,
      }}>SolShot plays best in landscape mode</div>
      <button
        onClick={handleDismiss}
        style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 11,
          color: 'rgba(255,255,255,0.4)',
          background: 'none',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 3,
          padding: '4px 12px',
          cursor: 'pointer',
          marginTop: 8,
          letterSpacing: 1,
        }}
      >Continue in Portrait</button>
      <style>{`
        @keyframes rotateHint {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(90deg); }
        }
      `}</style>
    </div>
  );
}

function App() {
  return (
    <TelegramProvider>
      <SolShotWalletProvider>
        <AppInner />
      </SolShotWalletProvider>
    </TelegramProvider>
  );
}

export default App;
