import { useEffect } from 'react';
import { useTelegram } from './TelegramContext';

/**
 * Show/hide the Telegram native back button per screen.
 * On non-menu screens: shows back button → calls onBack.
 * On menu screen: hides back button.
 */
function useTelegramBackButton(screenName, onBack) {
  const { isTelegram, webApp } = useTelegram();

  useEffect(() => {
    if (!isTelegram || !webApp?.BackButton) return;

    if (screenName === 'menu' || screenName === 'loading') {
      webApp.BackButton.hide();
      return;
    }

    webApp.BackButton.show();

    const handler = () => {
      if (onBack) onBack();
    };

    webApp.BackButton.onClick(handler);

    return () => {
      webApp.BackButton.offClick(handler);
      webApp.BackButton.hide();
    };
  }, [isTelegram, webApp, screenName, onBack]);
}

export default useTelegramBackButton;
