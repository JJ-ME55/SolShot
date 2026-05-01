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
  warn: {
    fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--accent)',
    lineHeight: 1.6, letterSpacing: '0.05em', marginBottom: 12,
    padding: '8px 12px', background: 'rgba(200,120,26,0.06)',
    border: '1px solid rgba(200,120,26,0.15)', clipPath: 'var(--clip-6)',
  },
};

function TermsScreen({ navigate }) {
  return (
    <>
      <TopBar title="TERMS OF SERVICE" onBack={() => navigate('menu')} />
      <div style={s.page}>
        <div style={s.content}>
          <div style={s.title}>TERMS OF SERVICE</div>
          <div style={s.updated}>Last Updated: February 19, 2026</div>
          <div style={s.warn}>
            BY ACCESSING OR USING SOLSHOT, YOU AGREE TO BE BOUND BY THESE TERMS. IF YOU DO NOT AGREE, DO NOT USE THE SERVICE.
          </div>

          <div style={s.section}>1. ELIGIBILITY</div>
          <div style={s.p}>1.1. You must be at least 18 years of age to use SolShot.</div>
          <div style={s.p}>1.2. You must be at least the legal age required to participate in wagering activities in your jurisdiction.</div>
          <div style={s.p}>1.3. By using SolShot, you represent and warrant that you are not located in, or a citizen or resident of, any jurisdiction where online wagering with cryptocurrency is prohibited by applicable law.</div>
          <div style={s.p}>1.4. It is your sole responsibility to determine whether your use of SolShot is legal in your jurisdiction.</div>
          <div style={s.p}>1.5. SolShot reserves the right to restrict access from any jurisdiction at any time, with or without notice.</div>

          <div style={s.section}>2. ACCOUNT & WALLET</div>
          <div style={s.p}>2.1. Your Solana wallet address serves as your identity on SolShot. There are no traditional accounts, usernames, or passwords.</div>
          <div style={s.p}>2.2. You are solely responsible for the security of your wallet, private keys, and seed phrases. SolShot has no ability to recover lost wallets or reverse blockchain transactions.</div>
          <div style={s.p}>2.3. SolShot does not store, manage, or have access to your private keys at any time.</div>
          <div style={s.p}>2.4. One wallet address per player. Use of multiple wallets to circumvent game rules, manipulate matchmaking, or abuse token emission mechanics is prohibited and may result in permanent ban.</div>

          <div style={s.section}>3. WAGERING</div>
          <div style={s.p}>3.1. SolShot allows players to wager SOL (Solana's native cryptocurrency) in peer-to-peer matches. Wagers are held in on-chain escrow smart contracts during matches.</div>
          <div style={s.p}>3.2. Available wager tiers: 0.01, 0.05, 0.1, 0.25, and 0.5 SOL. Practice matches with zero wager are also available.</div>
          <div style={s.p}>3.3. Upon match completion, the winner receives 90% of the total pot. 7% is allocated to the SolShot treasury. 3% is allocated to operational costs.</div>
          <div style={s.p}>3.4. Settlement is performed on-chain and is final. SolShot cannot reverse, modify, or dispute settled matches.</div>
          <div style={s.p}>3.5. If a player disconnects during a wagered match, a 30-second reconnection window is provided. Failure to reconnect results in forfeiture of the wager.</div>
          <div style={s.p}>3.6. If the SolShot server experiences a failure during an active match, the escrow contract will refund both players' wagers automatically.</div>
          <div style={s.p}>3.7. You acknowledge that wagering involves risk of financial loss. Never wager more than you can afford to lose.</div>

          <div style={s.section}>4. RESPONSIBLE GAMING</div>
          <div style={s.p}>4.1. SolShot is committed to responsible gaming. We encourage all players to set personal limits on time and money spent.</div>
          <div style={s.p}>4.2. If you believe you or someone you know has a gambling problem, please contact: BeGambleAware (begambleaware.org), National Council on Problem Gambling (ncpgambling.org), or GamCare (gamcare.org.uk).</div>
          <div style={s.p}>4.3. SolShot reserves the right to implement daily, weekly, or monthly wager limits, cool-down periods, or self-exclusion mechanisms at any time.</div>
          <div style={s.p}>4.4. Players may request voluntary self-exclusion by contacting us via Discord or email. Self-exclusion requests are processed within 24 hours and are irreversible for the stated duration.</div>

          <div style={s.section}>5. IN-GAME ECONOMY</div>
          <div style={s.p}>5.1. Gold is an in-match currency with no real-world value. Gold cannot be traded, sold, withdrawn, or transferred between matches.</div>
          <div style={s.p}>5.2. SHOT is an SPL token on the Solana blockchain. SHOT is earned through gameplay milestones and may be traded on decentralized exchanges. SolShot does not operate or control any exchange.</div>
          <div style={s.p}>5.3. SHOT tokens burned for prestige progression are permanently destroyed. Burns are irreversible.</div>
          <div style={s.p}>5.4. SolShot makes no representations about the current or future monetary value of SHOT tokens. SHOT is a utility token and should not be considered an investment.</div>

          <div style={s.section}>6. PROHIBITED CONDUCT</div>
          <div style={s.p}>You agree not to:</div>
          <div style={s.p}>6.1. Use bots, scripts, automation, or any non-human input to play matches.</div>
          <div style={s.p}>6.2. Exploit bugs, glitches, or vulnerabilities in the game client, server, or smart contracts.</div>
          <div style={s.p}>6.3. Collude with other players to manipulate match outcomes.</div>
          <div style={s.p}>6.4. Use multiple wallet addresses to circumvent game rules or abuse token emissions.</div>
          <div style={s.p}>6.5. Attempt to reverse-engineer, decompile, or modify the game client or server software.</div>
          <div style={s.p}>6.6. Use SolShot for money laundering or any other illegal financial activity.</div>
          <div style={s.p}>6.7. Harass, threaten, or abuse other players through any communication channel.</div>

          <div style={s.section}>7. INTELLECTUAL PROPERTY</div>
          <div style={s.p}>7.1. All SolShot game assets, code, design, branding, and documentation are the property of SolShot and its contributors.</div>
          <div style={s.p}>7.2. You may not reproduce, distribute, or create derivative works from SolShot's intellectual property without written permission.</div>
          <div style={s.p}>7.3. User-generated content (such as match replays or screenshots) may be shared freely with attribution to SolShot.</div>

          <div style={s.section}>8. DISCLAIMERS</div>
          <div style={s.p}>8.1. SolShot is provided "as is" and "as available" without warranties of any kind, express or implied.</div>
          <div style={s.p}>8.2. We do not guarantee uninterrupted, error-free, or secure operation of the service.</div>
          <div style={s.p}>8.3. We are not responsible for losses resulting from blockchain network congestion, smart contract failures, wallet compromise, or third-party service outages.</div>
          <div style={s.p}>8.4. Cryptocurrency values are volatile. SOL and SHOT token values may fluctuate significantly.</div>
          <div style={s.p}>8.5. SolShot is not a financial institution, broker, or gambling operator. We provide software that facilitates peer-to-peer wagering through blockchain smart contracts.</div>

          <div style={s.section}>9. LIMITATION OF LIABILITY</div>
          <div style={s.p}>9.1. To the maximum extent permitted by applicable law, SolShot and its contributors shall not be liable for any indirect, incidental, special, consequential, or punitive damages.</div>
          <div style={s.p}>9.2. Our total liability for any claim arising from or related to the service shall not exceed the amount you have wagered in the 30 days preceding the claim.</div>

          <div style={s.section}>10. MODIFICATIONS</div>
          <div style={s.p}>10.1. We reserve the right to modify these Terms at any time. Changes will be posted on solshot.gg and take effect immediately upon posting.</div>
          <div style={s.p}>10.2. We reserve the right to modify game mechanics, tokenomics, wager tiers, rake percentages, and other game parameters as development progresses.</div>
          <div style={s.p}>10.3. Continued use of SolShot after modifications constitutes acceptance of the updated Terms.</div>

          <div style={s.section}>11. TERMINATION</div>
          <div style={s.p}>11.1. We may suspend or terminate your access to SolShot at any time for violation of these Terms or for any reason at our discretion.</div>
          <div style={s.p}>11.2. Upon termination, any active wagers will be handled according to the escrow contract logic.</div>
          <div style={s.p}>11.3. SHOT tokens in your wallet remain yours regardless of account status — they exist on the blockchain independent of SolShot access.</div>

          <div style={s.section}>12. CONTACT</div>
          <div style={s.p}>For questions about these Terms:</div>
          <div style={s.p}>Twitter: @SolShotGG</div>
        </div>
      </div>
    </>
  );
}

export default TermsScreen;
