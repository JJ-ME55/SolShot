import React from 'react';

/* ── TelegramShare ──────────────────────────────────────────────────────────
   Telegram share button for post-match screens.
   Opens t.me/share/url with pre-filled match result text.

   Props:
     isWinner (bool)      — winner vs loser text tone
     playerScore (number) — player's rounds won
     opponentScore (number) — opponent's rounds won
     shareUrl (string)    — defaults to 'https://solshot.gg'
─────────────────────────────────────────────────────────────────────────── */

function TelegramShare({ isWinner, playerScore, opponentScore, shareUrl }) {
  var url = shareUrl || 'https://solshot.gg';

  var shareText = isWinner
    ? 'I just won ' + playerScore + '-' + opponentScore + ' on SolShot! Artillery combat on Solana. Play at solshot.gg'
    : 'Just played an intense ' + opponentScore + '-' + playerScore + ' match on SolShot! Artillery combat on Solana. Play at solshot.gg';

  var telegramUrl = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(shareText);

  var buttonStyle = {
    background: 'none',
    border: '1px solid #0088cc',
    borderRadius: 4,
    color: '#0088cc',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    letterSpacing: 2,
    padding: '8px 16px',
    cursor: 'pointer',
    textTransform: 'uppercase',
    opacity: 0.9,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  };

  var handleClick = function() {
    window.open(telegramUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <button style={buttonStyle} onClick={handleClick}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
      </svg>
      Telegram
    </button>
  );
}

export default TelegramShare;
