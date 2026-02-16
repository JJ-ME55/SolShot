import React, { useState, useCallback } from 'react';
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
    </Layout>
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
