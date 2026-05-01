import React from 'react';
import TopBar from '../components/TopBar';

const s = {
  page: { flex: 1, overflowY: 'auto', padding: '20px 30px 40px' },
  content: { maxWidth: 800, margin: '0 auto' },
  title: {
    fontFamily: "'Black Ops One', cursive", fontSize: 24, color: 'var(--rg)',
    letterSpacing: 3, marginBottom: 4, textTransform: 'uppercase',
  },
  updated: {
    fontFamily: "'Share Tech Mono', monospace", fontSize: 12, color: 'var(--kh)',
    opacity: 0.5, letterSpacing: 1, marginBottom: 20,
  },
  section: {
    fontFamily: "'Black Ops One', cursive", fontSize: 16, color: 'var(--rg)',
    letterSpacing: 2, marginTop: 24, marginBottom: 8,
    borderBottom: '1px solid var(--ol)', paddingBottom: 4,
  },
  p: {
    fontFamily: "'Share Tech Mono', monospace", fontSize: 13, color: 'var(--bn)',
    lineHeight: 1.7, letterSpacing: 0.5, marginBottom: 8, opacity: 0.9,
  },
};

function PrivacyScreen({ navigate }) {
  return (
    <>
      <TopBar title="PRIVACY POLICY" onBack={() => navigate('menu')} />
      <div style={s.page}>
        <div style={s.content}>
          <div style={s.title}>PRIVACY POLICY</div>
          <div style={s.updated}>Last Updated: February 19, 2026</div>

          <div style={s.section}>1. INTRODUCTION</div>
          <div style={s.p}>This Privacy Policy describes how SolShot ("we", "us", "the Service") collects, uses, and protects information when you use our game at solshot.gg. SolShot is designed with privacy in mind. We collect the minimum data necessary to operate the game.</div>

          <div style={s.section}>2. INFORMATION WE COLLECT</div>
          <div style={s.p}><strong>Wallet Address.</strong> SolShot provisions a Solana wallet for you automatically via Dynamic when you sign in with your Telegram identity. We receive your public wallet address as your sole identifier on the platform. We do not collect names, emails, phone numbers, or any other personal identifying information beyond your Telegram user ID.</div>
          <div style={s.p}><strong>Match Data.</strong> We record match results including: participating wallet addresses, wager amounts, weapons used, damage dealt, match duration, winner/loser designation, and settlement transaction signatures.</div>
          <div style={s.p}><strong>Gameplay Statistics.</strong> We track aggregate gameplay statistics per wallet: total matches, wins, losses, win rate, total damage, total Gold earned, SHOT tokens earned, prestige tier.</div>
          <div style={s.p}><strong>Technical Data.</strong> We may collect: IP address (for rate limiting and abuse prevention), browser type, device type, and connection timestamps. This data is not linked to wallet addresses for analytics purposes.</div>
          <div style={s.p}><strong>Cookies.</strong> SolShot uses essential cookies only for session management. We do not use tracking cookies, advertising cookies, or third-party analytics cookies.</div>

          <div style={s.section}>3. INFORMATION WE DO NOT COLLECT</div>
          <div style={s.p}>Real names, emails, phone numbers, private keys or seed phrases, financial information beyond wallet address, location data (beyond IP-derived country for compliance), social media accounts, or biometric data.</div>

          <div style={s.section}>4. HOW WE USE YOUR INFORMATION</div>
          <div style={s.p}>We use collected information to: operate the game (matchmaking, execution, settlement), maintain gameplay statistics and leaderboards, administer SHOT token emissions, prevent cheating and abuse, comply with legal requirements, and improve game performance.</div>
          <div style={s.p}>We do NOT sell your information to third parties, serve advertisements, build marketing profiles, or send unsolicited communications.</div>

          <div style={s.section}>5. ON-CHAIN DATA</div>
          <div style={s.p}>5.1. Certain actions result in on-chain Solana transactions: wager deposits, match settlements, SHOT token emissions, and prestige burns.</div>
          <div style={s.p}>5.2. On-chain transactions are public, permanent, and immutable. We cannot delete, modify, or hide on-chain data.</div>
          <div style={s.p}>5.3. Your wallet address and transaction history on the Solana blockchain are publicly visible to anyone, regardless of SolShot's privacy practices.</div>

          <div style={s.section}>6. DATA SHARING</div>
          <div style={s.p}>We do not sell, rent, or trade your information. We may share information with service providers (hosting, database) who process data on our behalf, or if required by law, regulation, or governmental request.</div>

          <div style={s.section}>7. DATA RETENTION</div>
          <div style={s.p}>7.1. Match records are retained indefinitely for leaderboard and statistics purposes.</div>
          <div style={s.p}>7.2. Technical logs (IP addresses, connection data) are retained for 90 days and then deleted.</div>
          <div style={s.p}>7.3. Gameplay statistics are retained as long as the wallet has been active within the past 12 months.</div>
          <div style={s.p}>7.4. On-chain data is permanent and cannot be deleted by us or anyone.</div>

          <div style={s.section}>8. DATA SECURITY</div>
          <div style={s.p}>8.1. We implement industry-standard security measures including encrypted connections (TLS/SSL), database access controls, and server-side input validation.</div>
          <div style={s.p}>8.2. Wager funds are held in on-chain escrow smart contracts, not on our servers.</div>
          <div style={s.p}>8.3. No system is 100% secure. We cannot guarantee absolute security of data transmitted to or stored by the Service.</div>

          <div style={s.section}>9. YOUR RIGHTS</div>
          <div style={s.p}>Depending on your jurisdiction, you may have the right to access, delete, object to, or restrict processing of the personal data we hold about your wallet address. To exercise these rights, contact us via Discord or Twitter. We will respond within 30 days.</div>

          <div style={s.section}>10. CHILDREN</div>
          <div style={s.p}>SolShot is not intended for use by anyone under the age of 18. We do not knowingly collect information from children under 18.</div>

          <div style={s.section}>11. CHANGES TO THIS POLICY</div>
          <div style={s.p}>We may update this Privacy Policy from time to time. Changes will be posted at solshot.gg. Continued use of SolShot after changes constitutes acceptance of the updated policy.</div>

          <div style={s.section}>12. CONTACT</div>
          <div style={s.p}>For privacy-related questions or data requests:</div>
          <div style={s.p}>Twitter: @SolShotGG</div>
        </div>
      </div>
    </>
  );
}

export default PrivacyScreen;
