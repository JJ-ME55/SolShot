import './styles/tokens.css';
import React, { useState, useCallback, useEffect, Suspense, lazy } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
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
import { useTelegram } from './telegram/TelegramContext';

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

  // Phase 24: Persistent handle identity — blocks menu until set
  // For Telegram users, auto-populate from TG username (skip HandleModal)
  const [handle, setHandle] = useState(() => {
    const stored = localStorage.getItem('solshot_handle');
    if (stored) return stored;
    return null;
  });

  // Auto-set handle from Telegram username (skips HandleModal for TG users)
  useEffect(() => {
    if (isTelegram && tgUser && !handle) {
      const tgHandle = tgUser.username || tgUser.first_name || 'TG_Player';
      const uid = 'tg_' + (tgUser.id || Date.now());
      localStorage.setItem('solshot_handle', tgHandle);
      localStorage.setItem('solshot_uid', uid);
      setHandle(tgHandle);
      if (window.socket?.connected) {
        window.socket.emit('registerIdentity', { uid, handle: tgHandle });
      }
    }
  }, [isTelegram, tgUser, handle]);

  const handleHandleComplete = useCallback((h, uid) => {
    setHandle(h);
    if (window.socket?.connected) {
      window.socket.emit('registerIdentity', { uid, handle: h });
    }
  }, []);

  // Phase 28: Send practice identity to server on socket connect
  useEffect(() => {
    const sock = window.socket;
    if (!sock) return;
    const sendIdentity = () => {
      const uid = localStorage.getItem('solshot_uid');
      const h = localStorage.getItem('solshot_handle');
      if (uid) sock.emit('registerIdentity', { uid, handle: h });
    };
    sock.on('connect', sendIdentity);
    if (sock.connected) sendIdentity();
    return () => sock.off('connect', sendIdentity);
  }, []);

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
    //   lobby_<matchId>  — wagered-mode join after deposit; routes to detail view
    //   match_<matchId>  — active-or-settled match; same screen, renders by state
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
    };
    const target = routes[startParam];
    if (target) {
      setScreen(target);
    }
    // Unknown / unhandled startParams (ch_*, rf_*, etc.) fall through to default menu.
    // Wire those when the corresponding feature lands.
  }, [startParam]);

  // CS-04: Use wallet adapter hook directly for rejoin logic (avoids window.solWallet)
  const { publicKey, signMessage } = useWallet();

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
