import React, { useState, useEffect } from 'react';

/* ── FAQ content ── */
const FAQ_SECTIONS = [
  {
    id: 'how-to-play',
    question: 'How do I play?',
    answer: "SolShot is a turn-based artillery game. Adjust angle and power, then fire to destroy your opponent's tank. Every match starts with the free Single Shot, and you buy more weapons each round using gold earned from dealing damage and winning rounds.",
  },
  {
    id: 'weapons',
    question: 'How do weapons work?',
    answer: '15 base weapons plus 5 prestige-locked weapons. They range from precise (Sniper Rifle, 100 damage on direct hit) to chaotic (Crazy Ivan, 15 random explosions). Buy them each round with gold.',
  },
  {
    id: 'shot-token',
    question: 'What is SHOT?',
    answer: "SHOT is SolShot's prestige currency. Earn it by hitting in-game milestones like your first wagered match, win streaks, and damage records. Burn it to unlock prestige tiers and their exclusive weapons. Fixed supply: 10M, mint authority burned.",
  },
  {
    id: 'prestige',
    question: 'What are prestige tiers?',
    answer: 'Five tiers: Bronze, Silver, Gold, Platinum, Diamond. Each unlocks an exclusive weapon (Homing Missile, Cruiser, Tommy Gun, Chain Reaction, Pineapple). You burn SHOT to advance. Reaching Diamond requires burning 8,400 SHOT total.',
  },
  {
    id: 'wagering',
    question: 'How does wagering work?',
    answer: 'In Wagered mode, you stake SOL (0.1 / 0.25 / 0.5 / 1) against your opponent. Stakes are held in a trustless on-chain escrow. Winners receive 90% of the pot, with 7% to treasury and 3% to operations.',
  },
  {
    id: 'wallets',
    question: 'Which wallets work?',
    answer: 'Sign in with email, Google, or Telegram via Privy. Your Solana wallet is created for you. Existing Phantom, Solflare, or Backpack users can also connect.',
  },
  {
    id: 'mobile',
    question: 'Best experience on mobile?',
    answer: 'Use Chrome or Safari in landscape mode for the best experience. Wallet dApp browsers are locked to portrait, so open solshot.gg directly in your mobile browser instead.',
  },
];

/* ── styles ── */
const s = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 9500,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: {
    position: 'relative',
    width: '100%',
    maxWidth: 600,
    maxHeight: '80vh',
    overflowY: 'auto',
    background: 'var(--od)',
    border: '1px solid var(--ol)',
    borderRadius: 6,
    margin: '0 16px',
    padding: '24px 20px 20px',
  },

  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 14,
    background: 'none',
    border: 'none',
    color: 'var(--kh)',
    fontSize: 22,
    cursor: 'pointer',
    lineHeight: 1,
    padding: '2px 6px',
  },

  title: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 20,
    color: 'var(--rg)',
    letterSpacing: 3,
    marginBottom: 18,
    marginTop: 0,
  },

  section: {
    borderBottom: '1px solid var(--ol)',
    marginBottom: 0,
  },

  questionBtn: (open) => ({
    width: '100%',
    background: 'none',
    border: 'none',
    textAlign: 'left',
    padding: '12px 0',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    fontFamily: "'Black Ops One', cursive",
    fontSize: 14,
    letterSpacing: 1,
    color: open ? 'var(--rg)' : 'var(--am)',
  }),

  chevron: (open) => ({
    fontSize: 12,
    color: open ? 'var(--rg)' : 'var(--kh)',
    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
    transition: 'transform 0.2s ease',
    flexShrink: 0,
  }),

  answer: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    color: 'var(--kh)',
    lineHeight: 1.6,
    paddingBottom: 14,
    paddingRight: 8,
  },
};

function FAQSection({ item, isOpen, onToggle }) {
  return (
    <div style={s.section}>
      <button style={s.questionBtn(isOpen)} onClick={onToggle} aria-expanded={isOpen}>
        <span>{item.question}</span>
        <span style={s.chevron(isOpen)}>&#9660;</span>
      </button>
      {isOpen && (
        <div style={s.answer}>{item.answer}</div>
      )}
    </div>
  );
}

export default function FAQ({ isOpen, onClose }) {
  const [openSection, setOpenSection] = useState(null);

  /* Close on Escape key */
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  /* Reset open section when modal closes */
  useEffect(() => {
    if (!isOpen) setOpenSection(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = () => onClose();
  const handleContentClick = (e) => e.stopPropagation();

  const handleToggle = (id) => {
    setOpenSection((prev) => (prev === id ? null : id));
  };

  return (
    <div style={s.backdrop} onClick={handleBackdropClick} role="dialog" aria-modal="true" aria-label="FAQ">
      <div style={s.content} onClick={handleContentClick}>
        <button style={s.closeBtn} onClick={onClose} aria-label="Close FAQ">&#10005;</button>
        <div style={s.title}>FREQUENTLY ASKED</div>
        {FAQ_SECTIONS.map((item) => (
          <FAQSection
            key={item.id}
            item={item}
            isOpen={openSection === item.id}
            onToggle={() => handleToggle(item.id)}
          />
        ))}
      </div>
    </div>
  );
}
