import React, { useState, useCallback, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { socket } from './socket/index';
import './utils/haptic';
import FAQ from './components/FAQ';
import { SolShotWalletProvider } from './wallet/WalletContext';
import { TelegramProvider } from './telegram/TelegramContext';
import useTelegramBackButton from './telegram/useTelegramBackButton';
import Layout from './components/Layout';
import LoadingScreen from './screens/LoadingScreen';
import MenuScreen from './screens/MenuScreen';
import LobbyScreen from './screens/LobbyScreen';
import ShopScreen from './screens/ShopScreen';
import BattleScreen from './screens/BattleScreen';
import WinScreen from './screens/WinScreen';
import LoseScreen from './screens/LoseScreen';
import ArmoryScreen from './screens/ArmoryScreen';
import PrestigeScreen from './screens/PrestigeScreen';
import BarracksScreen from './screens/BarracksScreen';
import HandleModal from './components/HandleModal';

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

  // Phase 24: Persistent handle identity — blocks menu until set
  const [handle, setHandle] = useState(() => localStorage.getItem('solshot_handle'));

  const handleHandleComplete = useCallback((h) => {
    setHandle(h);
  }, []);

  // CS-04: Use wallet adapter hook directly for rejoin logic (avoids window.solWallet)
  const { publicKey, signMessage } = useWallet();

  // Navigate between screens — spread copy to avoid stale refs
  const navigate = useCallback((nextScreen, data = {}) => {
    setScreenData({ ...data });
    setScreen(nextScreen);
  }, []);

  // Attempt to rejoin an active match after page reload / socket reconnect
  useEffect(() => {
    if (!window.socket) return;

    const handleRejoinSuccess = (data) => {
      // Server sent full state snapshot — jump straight to battle
      navigate('battle', {
        roomId: data.roomId,
        isHost: data.isHost,
        wager: data.wager || 0,
        round: data.matchState?.currentRound || 1,
        totalRounds: data.matchState?.maxRounds || 1,
        goldBalance: data.goldBalance,
        weapons: data.weapons,
        terrain: data.terrain,
        tankPositions: data.tankPositions,
        matchState: data.matchState,
        rejoined: true,
      });
    };

    const attemptRejoin = async () => {
      const walletAddress = publicKey?.toBase58();
      if (!walletAddress || !signMessage) {
        // Wallet not ready yet — retry once after 2s (covers async wallet adapter init)
        if (!attemptRejoin._retried) {
          attemptRejoin._retried = true;
          setTimeout(attemptRejoin, 2000);
        }
        return;
      }
      // Reset retry flag on successful attempt
      attemptRejoin._retried = false;

      try {
        const timestamp = Date.now();
        const message = `SolShot Auth: ${walletAddress} at ${timestamp}`;
        const encodedMessage = new TextEncoder().encode(message);
        const signature = await signMessage(encodedMessage);
        const signatureBase64 = btoa(String.fromCharCode(...signature));

        window.socket.emit('rejoinRoom', {
          walletAddress,
          message,
          signature: signatureBase64,
          timestamp,
        });
      } catch (err) {
        console.warn('[SolShot] Rejoin signature failed:', err.message);
        // Don't block — if signMessage fails (user rejects), the 30s reconnect window
        // allows another attempt on next socket connect event
      }
    };

    window.socket.on('rejoinSuccess', handleRejoinSuccess);

    // If socket is already connected, try rejoin immediately
    if (window.socket.connected) {
      attemptRejoin();
    }
    // Also try on each (re)connect
    window.socket.on('connect', attemptRejoin);

    return () => {
      window.socket.off('rejoinSuccess', handleRejoinSuccess);
      window.socket.off('connect', attemptRejoin);
    };
  }, [publicKey, signMessage, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Telegram native back button integration
  const handleTelegramBack = useCallback(() => {
    navigate('menu');
  }, [navigate]);

  useTelegramBackButton(screen, handleTelegramBack);

  const renderScreen = () => {
    switch (screen) {
      case 'loading':
        return <LoadingScreen navigate={navigate} />;
      case 'menu':
        return <MenuScreen navigate={navigate} />;
      case 'lobby':
        return <LobbyScreen navigate={navigate} screenData={screenData} />;
      case 'shop':
        return <ShopScreen navigate={navigate} screenData={screenData} />;
      case 'battle':
        return <BattleScreen navigate={navigate} screenData={screenData} />;
      case 'win':
        return <WinScreen navigate={navigate} screenData={screenData} />;
      case 'lose':
        return <LoseScreen navigate={navigate} screenData={screenData} />;
      case 'armory':
        return <ArmoryScreen navigate={navigate} />;
      case 'prestige':
        return <PrestigeScreen navigate={navigate} />;
      case 'barracks':
        return <BarracksScreen navigate={navigate} />;
      default:
        return <MenuScreen navigate={navigate} />;
    }
  };

  return (
    <Layout>
      {renderScreen()}
      {!handle && screen !== 'loading' && (
        <HandleModal onComplete={handleHandleComplete} />
      )}
      <PortraitWarning />
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
