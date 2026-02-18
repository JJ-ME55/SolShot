import React, { useState, useCallback, useEffect } from 'react';
import { socket } from './socket/index';
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

// Keep socket on window for Phaser + WalletContext access
window.socket = socket;

function AppInner() {
  const [screen, setScreen] = useState('loading');
  const [screenData, setScreenData] = useState({});

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

    const attemptRejoin = () => {
      const walletAddress = window.solWallet?.publicKey?.toString();
      if (walletAddress) {
        window.socket.emit('rejoinRoom', { walletAddress });
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      <PortraitWarning />
    </Layout>
  );
}

/* Rotate-to-landscape overlay for mobile portrait */
function PortraitWarning() {
  const [isPortrait, setIsPortrait] = useState(false);

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

  if (!isPortrait) return null;

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
