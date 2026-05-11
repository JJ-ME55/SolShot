import React, { useState, useEffect, useCallback, useRef } from 'react';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import Modal from '../components/Modal';
import useSocket from '../hooks/useSocket';
import TANK_COLORS from '../data/colors';
import { useSolShotWallet } from '../wallet/WalletContext';
import { haptic } from '../telegram/haptic';
import { EmptyState } from '../components/EmptyStates';
import useIsMobile from '../hooks/useIsMobile';
import ScanBtn from '../components/design/ScanBtn';

/* ── match modes (Litepaper v2.1) ──
 *
 * Option A simplification (2026-05-07): the legacy QUICK_MATCH / DUEL /
 * HIGH_ROLLER tabs are collapsed into a single WAGERED mode with a wager
 * picker. The legacy mode names are still derived server-side via
 * `legacyModeForWager()` so the matchmaking-queue segmentation (server
 * keys queues by matchMode:matchLength) is unchanged. The UI used to
 * surface those names as wager-tier subtitles but the labels are no
 * longer shown — the SOL amount is self-explanatory and the duplicate
 * "DUEL" on two tiers (0.25 + 0.5) read as a bug.
 *
 * vs_bot is client-side-only — server handles AI via `createAIMatch`.
 */
const MATCH_MODES = {
  vs_bot:           { label: 'VS SHOT BOT',      wagerRange: [0, 0],          formats: [1],       color: 'var(--kh)', aiOpponent: true },
  practice:         { label: 'PRACTICE',         wagerRange: [0, 0],          formats: [1],       color: 'var(--kh)' },
  wagered:          { label: 'WAGERED',          wagerRange: [0.1, 1.0],      formats: [1, 3, 5], color: 'var(--sg)' },
  custom_challenge: { label: 'CUSTOM CHALLENGE', wagerRange: [0, Infinity],   formats: [1, 3, 5], color: '#ff6600' },
};
const MODE_KEYS = Object.keys(MATCH_MODES);

/* ── wager-tier metadata for the WAGERED mode ──
 * Each tier carries: amount, legacy mode (sent to server for queue
 * segmentation) and valid formats (BO1/BO3/BO5 — preserves server
 * validation). Marketing labels are kept on the records for any consumer
 * that still wants them, but the lobby UI no longer renders them. */
const WAGER_TIERS = [
  { amount: 0.1,  legacyMode: 'quick_match', formats: [1, 3],    label: 'QUICK MATCH' },
  { amount: 0.25, legacyMode: 'duel',        formats: [3, 5],    label: 'DUEL' },
  { amount: 0.5,  legacyMode: 'duel',        formats: [3, 5],    label: 'DUEL' },
  { amount: 1.0,  legacyMode: 'high_roller', formats: [3, 5],    label: 'HIGH ROLLER' },
];
function legacyModeForWager(wager) {
  const tier = WAGER_TIERS.find(t => t.amount === wager);
  return tier ? tier.legacyMode : null;
}
function formatsForWager(wager) {
  const tier = WAGER_TIERS.find(t => t.amount === wager);
  return tier ? tier.formats : [1, 3, 5];
}

/* ── all wager tiers — Litepaper v2.1 ── */
const ALL_WAGER_TIERS = [0, 0.1, 0.25, 0.5, 1.0];

/* ── all match-length options ── */
const ALL_MATCH_LENGTHS = [
  { label: 'BO1', rounds: 1 },
  { label: 'BO3', rounds: 3 },
  { label: 'BO5', rounds: 5 },
];

/* ── styles ── */
const s = {
  container: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },

  /* Left Panel — Config */
  left: {
    width: '30%',
    minWidth: 200,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    borderRight: '1px solid var(--ol)',
    overflowY: 'auto',
  },
  sectionLabel: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 15,
    color: 'var(--am)',
    letterSpacing: 2,
    marginBottom: 4,
  },
  sublabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.7,
    marginBottom: 4,
  },

  /* Match length row */
  matchRow: {
    display: 'flex',
    gap: 6,
  },
  matchBtn: (active) => ({
    flex: 1,
    padding: '8px 0',
    fontFamily: "'Black Ops One', cursive",
    fontSize: 14,
    letterSpacing: 2,
    textAlign: 'center',
    clipPath: 'var(--clip-6)',
    cursor: 'pointer',
    border: active ? '1px solid var(--rg)' : '1px solid var(--ol)',
    background: active ? 'rgba(255, 107, 26, 0.12)' : 'var(--od)',
    color: active ? 'var(--rg)' : 'var(--kh)',
    transition: 'all 0.15s ease',
    userSelect: 'none',
  }),

  /* Wager selector */
  wagerRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  wagerBtn: (active) => ({
    padding: '5px 10px',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    letterSpacing: 1,
    clipPath: 'var(--clip-6)',
    cursor: 'pointer',
    border: active ? '1px solid var(--sg)' : '1px solid var(--ol)',
    background: active ? 'rgba(20, 241, 149, 0.08)' : 'transparent',
    color: active ? 'var(--sg)' : 'var(--kh)',
    transition: 'all 0.15s ease',
    userSelect: 'none',
  }),

  /* Color picker */
  colorRow: {
    display: 'flex',
    gap: 5,
    flexWrap: 'wrap',
  },
  colorSwatch: (hex, selected) => ({
    width: 28,
    height: 28,
    clipPath: 'var(--clip-6)',
    background: hex,
    border: selected ? '2px solid var(--bn)' : '2px solid transparent',
    cursor: 'pointer',
    transition: 'border 0.15s ease',
    boxShadow: selected ? `0 0 8px ${hex}` : 'none',
  }),

  /* Mode selector */
  modeRow: {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
  },
  modeBtn: (active, color) => ({
    flex: 1,
    minWidth: 70,
    padding: '6px 0',
    fontFamily: "'Black Ops One', cursive",
    fontSize: 11,
    letterSpacing: 1,
    textAlign: 'center',
    clipPath: 'var(--clip-6)',
    cursor: 'pointer',
    border: active ? `1px solid ${color}` : '1px solid var(--ol)',
    background: active ? `${color}14` : 'var(--od)',
    color: active ? color : 'var(--kh)',
    transition: 'all 0.15s ease',
    userSelect: 'none',
  }),

  /* Quick action buttons */
  quickBtns: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 4,
  },

  /* Right Panel — Room List */
  right: {
    flex: 1,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  roomListHeader: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 15,
    color: 'var(--am)',
    letterSpacing: 2,
    marginBottom: 8,
  },
  roomList: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  roomCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: 'rgba(42, 51, 31, 0.4)',
    border: '1px solid var(--ol)',
    clipPath: 'var(--clip-6)',
    gap: 10,
  },
  roomInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  hostColor: (hex) => ({
    width: 16,
    height: 16,
    borderRadius: 2,
    background: hex,
    flexShrink: 0,
  }),
  hostName: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 14,
    color: 'var(--bn)',
    letterSpacing: 1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  wagerBadge: (amount) => ({
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    letterSpacing: 1,
    padding: '3px 8px',
    clipPath: 'var(--clip-6)',
    background: amount > 0 ? 'rgba(20, 241, 149, 0.08)' : 'rgba(184, 168, 138, 0.08)',
    border: amount > 0 ? '1px solid rgba(20, 241, 149, 0.3)' : '1px solid rgba(184, 168, 138, 0.15)',
    color: amount > 0 ? 'var(--sg)' : 'var(--kh)',
    flexShrink: 0,
  }),
  modeBadge: (color) => ({
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    letterSpacing: 1,
    padding: '2px 6px',
    borderRadius: 2,
    color: color || 'var(--kh)',
    border: `1px solid ${color || 'var(--kh)'}33`,
    flexShrink: 0,
  }),
  formatBadge: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    letterSpacing: 1,
    padding: '2px 6px',
    borderRadius: 2,
    color: 'var(--kh)',
    border: '1px solid rgba(184, 168, 138, 0.15)',
    flexShrink: 0,
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 14,
    color: 'var(--kh)',
    letterSpacing: 2,
    opacity: 0.5,
  },

  /* Waiting overlay */
  waitingOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(10, 12, 8, 0.85)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    gap: 12,
  },
  waitingText: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 20,
    color: 'var(--am)',
    letterSpacing: 3,
    animation: 'fl 2s ease-in-out infinite',
  },
  waitingSubtext: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 14,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.7,
  },
};


function LobbyScreen({ navigate, screenData }) {
  const isMobile = useIsMobile();

  /* ── state ── */
  const [rooms, setRooms] = useState([]);
  const [matchMode, setMatchMode] = useState('practice');
  const [matchLength, setMatchLength] = useState(1); // rounds: 1, 3, 5
  const [wager, setWager] = useState(0.1);
  const [customWager, setCustomWager] = useState(0.1); // for custom_challenge mode
  const [selectedColor, setSelectedColor] = useState(0); // index into TANK_COLORS
  const [waiting, setWaiting] = useState(false); // waiting for opponent (custom_challenge / createRoom)
  const [queueState, setQueueState] = useState(null); // null | 'searching' | 'matched'
  // Live snapshot of active matchmaking queue buckets — server broadcasts
  // this on every queue mutation. Drives the "N WAITING" badge below the
  // FIND MATCH button so a user can see at a glance whether tapping will
  // pair them instantly or put them in solo wait.
  const [queueSnapshot, setQueueSnapshot] = useState([]);
  const [error, setError] = useState(null);
  const [showEscrow, setShowEscrow] = useState(false);
  const [matchFound, setMatchFound] = useState(false);
  const [numPlayers, setNumPlayers] = useState(2);
  const [waitingRoomPlayers, setWaitingRoomPlayers] = useState([]);
  const [waitingRoomMax, setWaitingRoomMax] = useState(2);

  // Deposit flow state (N-player escrow)
  const [depositStatuses, setDepositStatuses] = useState([]);
  const [depositCountdown, setDepositCountdown] = useState(null);
  const [isDecisionMaker, setIsDecisionMaker] = useState(false);
  const [partialDepositInfo, setPartialDepositInfo] = useState(null);
  const [kickedMessage, setKickedMessage] = useState(null);
  const [challengeCallsign, setChallengeCallsign] = useState('');
  const [challengeSentTo, setChallengeSentTo] = useState(null);
  const [incomingChallenge, setIncomingChallenge] = useState(null); // { fromSocketId, fromCallsign }
  const [confirmJoin, setConfirmJoin] = useState(null); // { roomId, hostName, mode, format }
  // Phase 3 — Telegram challenge sharing (Satori card + switchInlineQuery)
  const [challengeShortCode, setChallengeShortCode] = useState(null);
  const [challengeDeepLink, setChallengeDeepLink] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const challengeAutoFiredRef = useRef(false);
  const countdownRef = useRef(null);

  // CS-04: Use context hook instead of window.solWallet
  const { signAndSendEscrowDeposit, walletAddress, balance: solBalance, fundWallet, login } = useSolShotWallet();

  // Derived: available wagers + formats for current mode
  const modeConfig = MATCH_MODES[matchMode];
  const isCustomMode = matchMode === 'custom_challenge';
  const availableWagers = isCustomMode
    ? [] // custom mode uses numeric input instead
    : ALL_WAGER_TIERS.filter(
        (t) => t >= modeConfig.wagerRange[0] && t <= modeConfig.wagerRange[1]
      );
  const availableFormats = ALL_MATCH_LENGTHS.filter(
    (m) => modeConfig.formats.includes(m.rounds)
  );
  // Effective wager — custom mode uses customWager input
  const effectiveWager = isCustomMode ? customWager : wager;

  // Auto-constrain wager + format when mode changes
  useEffect(() => {
    const cfg = MATCH_MODES[matchMode];
    // Reset wager to first valid tier
    const validWagers = ALL_WAGER_TIERS.filter(
      (t) => t >= cfg.wagerRange[0] && t <= cfg.wagerRange[1]
    );
    if (!validWagers.includes(wager)) {
      setWager(validWagers[0] ?? 0);
    }
    // Reset format to first valid option
    if (!cfg.formats.includes(matchLength)) {
      setMatchLength(cfg.formats[0]);
    }
  }, [matchMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // WAGERED mode: format options narrow based on wager tier (Option A
  // preserves the same valid (wager, format) pairs as the legacy
  // quick_match / duel / high_roller modes — server validation unchanged).
  useEffect(() => {
    if (matchMode !== 'wagered') return;
    const validFormats = formatsForWager(wager);
    if (!validFormats.includes(matchLength)) {
      setMatchLength(validFormats[0]);
    }
  }, [matchMode, wager]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── derived player name from wallet context ── */
  const getPlayerName = useCallback(() => {
    const handle = localStorage.getItem('solshot_handle');
    if (handle) return handle;
    if (walletAddress) {
      return walletAddress.slice(0, 4) + '...' + walletAddress.slice(-4);
    }
    return 'SOLDIER';
  }, [walletAddress]);

  /* ── deposit state cleanup helper ── */
  const clearDepositState = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setDepositCountdown(null);
    setDepositStatuses([]);
    setIsDecisionMaker(false);
    setPartialDepositInfo(null);
  }, []);

  /* ── unmount: clear countdown interval ── */
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  /* ── fetch rooms on mount ── */
  useEffect(() => {
    if (window.socket) {
      window.socket.emit('getRooms');
    }
  }, []);

  /* ── Phase 3 — arriving via /challenge bot command or "challenge_new" deep link.
      Switch to CUSTOM CHALLENGE mode with sensible defaults so the user picks
      their wager + format BEFORE creating a Challenge doc. The actual create
      fires when they hit "CREATE CHALLENGE" via createWageredChallenge(). */
  useEffect(() => {
    if (!screenData?.autoCreateChallenge) return;
    if (challengeAutoFiredRef.current) return;
    challengeAutoFiredRef.current = true;
    setMatchMode('custom_challenge');
    setCustomWager(0.1);
    setMatchLength(1); // BO1 default
  }, [screenData]);

  /* ── socket: live queue snapshot for "N WAITING" badge ── */
  useSocket('queueSnapshot', (data) => {
    setQueueSnapshot(Array.isArray(data) ? data : []);
  });

  /* ── socket: room list ── */
  useSocket('setRooms', (data) => {
    if (data && data.rooms) {
      setRooms(data.rooms);
    }
  });

  /* ── socket: waiting room state (N-player partial fill) ── */
  useSocket('roomUpdate', (data) => {
    if (data && data.players) {
      setWaitingRoomPlayers(data.players);
      setWaitingRoomMax(data.maxPlayers || 2);
    }
  });

  /* ── Phase 3 — challenge created (from /challenge bot flow) ── */
  useSocket('challengeCreated', (data) => {
    if (!data) return;
    setChallengeShortCode(data.shortCode);
    setChallengeDeepLink(data.deepLink);
  });
  useSocket('challengeCreateError', (data) => {
    setError(data?.reason || 'Could not create challenge');
  });

  /* ── socket: escrow deposit (sign wager before match starts) ── */
  useSocket('escrowDeposit', async (data) => {
    if (!data?.transaction) return;
    if (signAndSendEscrowDeposit) {
      const sig = await signAndSendEscrowDeposit(data.transaction, data.roomId);
      if (!sig) {
        setError('Failed to deposit wager. Try again or lower your wager.');
      }
    }
    // Start countdown timer from server timestamp
    if (data.depositDeadlineMs) {
      if (countdownRef.current) clearInterval(countdownRef.current);
      const tick = () => {
        const rem = Math.max(0, Math.ceil((data.depositDeadlineMs - Date.now()) / 1000));
        setDepositCountdown(rem);
        if (rem <= 0) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      };
      tick();
      countdownRef.current = setInterval(tick, 1000);
    }
  });

  /* ── socket: per-player deposit status updates ── */
  useSocket('escrowDepositStatus', (data) => {
    setDepositStatuses(data?.deposits || []);
  });

  /* ── socket: partial deposit — decision maker (host) view ── */
  useSocket('escrowPartialDeposit', (data) => {
    setIsDecisionMaker(true);
    setPartialDepositInfo({
      numDeposited: data.numDeposited,
      totalPlayers: data.totalPlayers,
      canStart: data.canStart,
    });
    // Replace deposit countdown with 30s decision countdown
    if (countdownRef.current) clearInterval(countdownRef.current);
    const decisionDeadline = Date.now() + (data.decisionWindowMs || 30000);
    const tick = () => {
      const rem = Math.max(0, Math.ceil((decisionDeadline - Date.now()) / 1000));
      setDepositCountdown(rem);
      if (rem <= 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
    tick();
    countdownRef.current = setInterval(tick, 1000);
  });

  /* ── socket: partial deposit — non-decision-maker (non-host) view ── */
  useSocket('escrowPartialWaiting', (data) => {
    setPartialDepositInfo({
      numDeposited: data.numDeposited,
      totalPlayers: data.totalPlayers,
      canStart: false,
      waitingForDecision: true,
    });
    if (countdownRef.current) clearInterval(countdownRef.current);
    setDepositCountdown(null);
  });

  /* ── socket: all deposits confirmed, match starting ── */
  useSocket('escrowActive', () => {
    clearDepositState();
  });

  /* ── socket: host cancelled, room preserved, all refunded ── */
  useSocket('escrowCancelledAll', () => {
    clearDepositState();
    setWaiting(false);
    setError('Match cancelled -- all deposits refunded.');
  });

  /* ── socket: deposit window expired, match cancelled ── */
  useSocket('escrowDepositTimeout', () => {
    clearDepositState();
    setWaiting(false);
    setError('Deposit window expired -- match cancelled.');
  });

  /* ── socket: kicked from room (non-depositor) ── */
  useSocket('kickedFromRoom', (data) => {
    clearDepositState();
    setWaiting(false);
    setKickedMessage(data?.reason || 'You were removed from the match.');
  });

  /* ── socket: game starts ── */
  useSocket('startPick', (data) => {
    clearDepositState();
    setWaiting(false);
    setQueueState(null);
    setWaitingRoomPlayers([]);
    setMatchFound(true);
    setTimeout(() => {
      setMatchFound(false);
      navigate('shop', data);
    }, 800);
  });

  /* ── socket: join error ── */
  useSocket('joinRoomError', (data) => {
    setError(data?.reason || 'Failed to join room');
  });

  /* ── socket: create error ── */
  useSocket('createRoomError', (data) => {
    setWaiting(false);
    setError(data?.reason || 'Failed to create room');
  });

  /* ── socket: AI match shop phase (vs_bot mode) ──
   * Server emits shopPhase immediately after createAIMatch — no opponent
   * matchmaking, no deposit. Mirror AIPracticeScreen's listener so the
   * lobby's VS SHOT BOT mode lands the user in shop directly. */
  useSocket('shopPhase', (data) => {
    if (matchMode === 'vs_bot') {
      navigate('shop', { ...data, isAIMatch: true });
    }
  });

  /* ── socket: opponent left while waiting ── */
  useSocket('opponentLeft', () => {
    clearDepositState();
    setWaiting(false);
    setWaitingRoomPlayers([]);
    setError('A player has left the lobby');
    if (window.socket) {
      window.socket.emit('getRooms');
    }
  });

  /* ── socket: queue events ── */
  useSocket('queueWaiting', () => {
    // Server confirmed we are in the queue
    setQueueState('searching');
  });

  useSocket('queueMatched', () => {
    // Match found — server will emit roomUpdate + startPick after 2.5s delay
    setQueueState('matched');
    setWaiting(true);
  });

  useSocket('queueError', (data) => {
    setQueueState(null);
    setError(data?.reason || 'Queue error');
  });

  useSocket('queueLeft', () => {
    setQueueState(null);
  });

  /* ── socket: callsign challenge events ── */
  useSocket('challengeSent', (data) => {
    setChallengeSentTo(data?.callsign || null);
  });

  useSocket('challengeError', (data) => {
    setChallengeSentTo(null);
    setError(data?.reason || 'Challenge failed');
  });

  useSocket('challengeReceived', (data) => {
    setIncomingChallenge({ fromSocketId: data.fromSocketId, fromCallsign: data.fromCallsign });
  });

  useSocket('challengeAccepted', () => {
    // Opponent accepted — create the room automatically
    setChallengeSentTo(null);
    // Inline createRoom logic to avoid forward reference issue
    if (!window.socket) return;
    const handle = localStorage.getItem('solshot_handle');
    const name = handle || (walletAddress ? walletAddress.slice(0, 4) + '...' + walletAddress.slice(-4) : 'SOLDIER');
    const color = TANK_COLORS[selectedColor].phaserHex;
    window.socket.emit('createRoom', {
      player: {
        name,
        color,
        walletAddress: walletAddress || null,
        wager: 0,
        matchLength: 1,
        matchMode: 'practice',
        maxPlayers: 2,
      },
    });
    setWaiting(true);
  });

  useSocket('challengeDeclined', (data) => {
    setChallengeSentTo(null);
    setError((data?.byCallsign || 'Player') + ' declined your challenge');
  });

  /* ── cleanup: leave queue on unmount ── */
  useEffect(() => {
    return () => {
      if (window.socket) {
        window.socket.emit('leaveQueue');
      }
    };
  }, []);

  /* ── actions ── */
  const createRoom = useCallback(async () => {
    if (!window.socket) return;

    haptic.medium(); // primary CTA: room/challenge create

    const name = getPlayerName();
    const color = TANK_COLORS[selectedColor].phaserHex;
    const wagerToSend = isCustomMode ? customWager : wager;

    // VS SHOT BOT mode dispatches to the AI flow (createAIMatch) instead
    // of the multiplayer createRoom path. Match starts immediately, no
    // wager, no opponent matchmaking — same backend as AIPracticeScreen.
    if (matchMode === 'vs_bot') {
      window.socket.emit('createAIMatch', {
        player: { name, color },
      });
      return;
    }

    // Phase 3a — sign-in gate. Wagered modes need a bound wallet before
    // anything else. If the user got this far without signing in, open
    // Privy's login modal directly instead of falling through to the
    // balance gate (which surfaced a misleading "Insufficient SOL"
    // error to a layman who actually has no wallet to be insufficient
    // in). AJVD QA pass May 8 — judges hitting the wagered tab cold
    // would see the wrong error. Login modal is the right CTA.
    if (wagerToSend > 0 && !walletAddress) {
      if (login) {
        await login();
      }
      // After login() returns the user has either signed in (walletAddress
      // populates on next render) or cancelled the modal. Either way bail
      // here and let them tap Find again — clean state.
      return;
    }

    // Phase 3b — balance gate. If user picks a wagered match they
    // can't afford, open Privy's Apple/Google Pay funding modal instead
    // of letting the deposit silently fail. We add a small buffer
    // (0.005 SOL) for transaction fees on top of the wager.
    const FEE_BUFFER_SOL = 0.005;
    if (wagerToSend > 0 && fundWallet && (solBalance ?? 0) < wagerToSend + FEE_BUFFER_SOL) {
      // Suggest funding 0.05 SOL more than the shortfall, rounded up to
      // a clean increment. This way the user can play multiple matches
      // before having to top up again.
      const shortfall = wagerToSend + FEE_BUFFER_SOL - (solBalance ?? 0);
      const suggested = Math.max(0.05, Math.ceil(shortfall * 20) / 20); // round up to nearest 0.05
      const opened = await fundWallet({ amount: suggested.toFixed(2) });
      if (!opened) {
        setError('Insufficient SOL to wager. Add SOL via your wallet menu or fund your address directly.');
        return;
      }
      // After Privy's modal closes, re-check balance via refresh and
      // bail — user retries Find Match once funded. (Privy's onramp is
      // async; balance arrives in seconds-to-minutes after card auth.)
      return;
    }

    // Custom Challenge → emit createChallengeRoom (creates a Challenge document
    // + shortCode + shareable deep link). The lobby's challenge share panel
    // renders automatically once the server responds with `challengeCreated`,
    // and that share panel IS the "what to do next" UI for custom challenge —
    // the user copies the link or sends the card to a specific friend.
    // No matchmaking-queue, no random-opponent waiting, so we deliberately
    // do NOT raise the AWAITING OPPONENT modal here (would cover the share
    // panel that the user actually needs to interact with).
    if (isCustomMode) {
      const formatStr = matchLength === 5 ? 'BO5' : matchLength === 3 ? 'BO3' : 'BO1';
      window.socket.emit('createChallengeRoom', {
        player: {
          name,
          color,
          walletAddress: walletAddress || null,
          wager: wagerToSend,
        },
        format: formatStr,
        wagerToken: 'SOL',
      });
      return;
    }

    // Derive the legacy mode name for server matchmaking-queue keying.
    // Server's `MATCH_MODES` (in services/solana.js) doesn't know about
    // the new client-side WAGERED mode — it expects quick_match / duel /
    // high_roller / practice / custom_challenge. legacyModeForWager()
    // maps wager amount → the corresponding legacy mode.
    let serverMatchMode = matchMode;
    if (matchMode === 'wagered') {
      const legacy = legacyModeForWager(wagerToSend);
      if (!legacy) {
        setError('Invalid wager amount for WAGERED mode');
        return;
      }
      serverMatchMode = legacy;
    }

    window.socket.emit('createRoom', {
      player: {
        name,
        color,
        walletAddress: walletAddress || null,
        wager: wagerToSend,
        matchLength,
        matchMode: serverMatchMode,
        maxPlayers: numPlayers,
      },
    });

    setWaitingRoomMax(numPlayers);
    setWaiting(true);
  }, [getPlayerName, selectedColor, wager, customWager, isCustomMode, matchLength, matchMode, walletAddress, numPlayers, solBalance, fundWallet]);

  const joinRoom = useCallback(async (roomId) => {
    if (!window.socket) return;

    const name = getPlayerName();
    const color = TANK_COLORS[selectedColor].phaserHex;

    // Sign-in gate (mirrors createRoom). Wagered joins need a bound wallet
    // first — open Privy login modal instead of falling through to the
    // balance gate's misleading "Insufficient SOL" error.
    if (wager > 0 && !walletAddress) {
      if (login) {
        await login();
      }
      return;
    }

    // Phase 3 — same balance gate as createRoom. If joining a wagered
    // room without enough SOL, surface the funding modal instead of
    // landing in deposit-fails-silently territory.
    const FEE_BUFFER_SOL = 0.005;
    if (wager > 0 && fundWallet && (solBalance ?? 0) < wager + FEE_BUFFER_SOL) {
      const shortfall = wager + FEE_BUFFER_SOL - (solBalance ?? 0);
      const suggested = Math.max(0.05, Math.ceil(shortfall * 20) / 20);
      const opened = await fundWallet({ amount: suggested.toFixed(2) });
      if (!opened) {
        setError('Insufficient SOL to join this match. Add SOL and try again.');
      }
      return;
    }

    window.socket.emit('joinRoom', {
      roomId,
      name,
      color,
      walletAddress: walletAddress || null,
      wager,
    });
  }, [getPlayerName, selectedColor, wager, walletAddress, solBalance, fundWallet]);

  const cancelRoom = useCallback(() => {
    if (!window.socket) return;
    window.socket.emit('deleteRoom');
    setWaiting(false);
    setWaitingRoomPlayers([]);
    // Refresh rooms after cancel
    setTimeout(() => {
      if (window.socket) window.socket.emit('getRooms');
    }, 200);
  }, []);

  const joinQueue = useCallback(() => {
    if (!window.socket) return;
    haptic.medium(); // primary CTA: queue join
    const name = getPlayerName();
    const color = TANK_COLORS[selectedColor].phaserHex;
    const wagerToSend = isCustomMode ? customWager : wager;
    // Same legacy-mode derivation as createRoom — server queues are
    // segmented by quick_match / duel / high_roller, not by the new
    // client-side WAGERED bucket.
    const serverMatchMode = matchMode === 'wagered'
      ? legacyModeForWager(wagerToSend)
      : matchMode;
    window.socket.emit('joinQueue', {
      matchMode: serverMatchMode,
      matchLength,
      wager: wagerToSend,
      playerName: name,
      tankColor: color,
    });
    setQueueState('searching');
  }, [getPlayerName, selectedColor, matchMode, matchLength, wager, customWager, isCustomMode]);

  // ── Find-or-create unified matchmaking ────────────────────────────────
  // Replaces the legacy joinQueue button for wagered modes (Quick Match,
  // Duel, High Roller). Behaviour:
  //   1. Scan OPEN LOBBIES for a matching (mode, length, wager) waiting
  //      lobby. If found → joinRoom (instant matchmaking preserved).
  //   2. Otherwise → createRoom, which surfaces the lobby in the right-
  //      hand panel for OTHER players to discover and join (giving us
  //      the visibility JJ asked for).
  // Practice mode still uses createRoom directly via the CREATE MATCH
  // button. Custom Challenge still uses createChallengeRoom (separate
  // share-link flow). Server queue (joinQueue) remains as legacy
  // fallback — not invoked by this path but still wired in case we
  // need it.
  const findOrCreateMatch = useCallback(() => {
    if (!window.socket) return;
    const wagerToSend = isCustomMode ? customWager : wager;
    // Server still tags open rooms with the legacy mode names
    // (quick_match / duel / high_roller). When the client is in WAGERED
    // mode, derive the legacy mode from the selected wager so we match
    // open rooms correctly.
    const targetMode = matchMode === 'wagered'
      ? legacyModeForWager(wagerToSend)
      : matchMode;
    // Look for a matching room: same mode, same total rounds, same
    // wager, and not full. Wager comparison is exact to avoid drift
    // between e.g. 0.1 and 0.10000001 from FP math (current tiers are
    // integer-stepped so this is fine).
    const matching = rooms.find((r) =>
      r.matchMode === targetMode
      && (r.totalRounds || 1) === matchLength
      && (r.wager || 0) === wagerToSend
      && (r.currentPlayers || 1) < (r.maxPlayers || 2)
    );
    if (matching) {
      // Existing waiting lobby — join it (uses our balance gate)
      joinRoom(matching.roomId);
    } else {
      // No match — host one. Lobby card appears in the right pane for
      // other players to find. Same balance gate runs in createRoom.
      createRoom();
    }
  }, [rooms, matchMode, matchLength, wager, customWager, isCustomMode, joinRoom, createRoom]);

  const cancelQueue = useCallback(() => {
    if (!window.socket) return;
    window.socket.emit('leaveQueue');
    setQueueState(null);
  }, []);

  const handlePartialStart = useCallback(() => {
    if (!window.socket) return;
    window.socket.emit('escrowPartialStart');
  }, []);

  const handleCancelAll = useCallback(() => {
    if (!window.socket) return;
    window.socket.emit('escrowCancelAll');
  }, []);

  /* ── helpers ── */
  const getColorHex = (phaserColor) => {
    const found = TANK_COLORS.find((c) => c.phaserHex === phaserColor);
    return found ? found.hex : '#FFFFFF';
  };

  // Colors claimed by other players in the waiting room (excluding self)
  const claimedColors = waitingRoomPlayers
    .filter(p => p.socketId !== (window.socket && window.socket.id))
    .map(p => p.color);

  const formatWagerWithPayout = (amount, players = 2) => {
    if (amount === 0) return 'FREE';
    const pot = (amount * players).toFixed(2);
    const payout = (amount * players * 0.90).toFixed(3);
    return pot + ' SOL pot \u2014 winner takes ' + payout + ' SOL';
  };

  // ── MOBILE LANDSCAPE BRANCH ──────────────────────────────────────────
  // 3-column landscape layout per HAndover from Design/mobile/MobileDeploy.jsx.
  // Uses the shipped 4-mode taxonomy (vs_bot / practice / wagered / custom_challenge).
  // All state, handlers, socket events stay unchanged — this branch only
  // changes the render output. The existing desktop return follows below.
  if (isMobile) {
    const wageredEnabled = process.env.REACT_APP_WAGERED_ENABLED === 'true';
    const mobileModeSectionLabel = {
      fontFamily: 'var(--f-mono)', fontSize: 8,
      color: 'var(--olive)', letterSpacing: '0.25em',
      marginBottom: 4,
    };
    const mobileChipStyle = (active, color) => ({
      padding: '4px 8px',
      background: active ? (color || 'var(--accent)') : 'var(--bg-raised)',
      color: active ? '#0e1209' : 'var(--bone)',
      border: '1px solid ' + (active ? (color || 'var(--accent-hot)') : 'var(--border)'),
      clipPath: 'var(--clip-6)',
      fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.12em',
      cursor: 'pointer',
      userSelect: 'none',
    });
    const mobileModes = [
      { key: 'vs_bot',           label: 'VS BOT',          sub: 'PRACTICE · FREE' },
      { key: 'practice',         label: 'PRACTICE',        sub: '1V1 · FREE' },
      { key: 'wagered',          label: 'WAGERED',         sub: 'MATCHMAKE · SOL' },
      { key: 'custom_challenge', label: 'CUSTOM',          sub: 'SET TERMS' },
    ];
    const playerHandle = getPlayerName();

    // Determine wager display label for summary card
    const summaryWagerLabel = isCustomMode
      ? (customWager === 0 ? 'FREE' : customWager + ' SOL')
      : matchMode === 'practice' || matchMode === 'vs_bot'
        ? 'FREE'
        : effectiveWager > 0
          ? effectiveWager + ' SOL'
          : 'FREE';

    // Open lobbies filtered to current mode (if not custom)
    const filteredRooms = isCustomMode
      ? []
      : rooms.filter(r => {
          const targetMode = matchMode === 'wagered' ? legacyModeForWager(effectiveWager) : matchMode;
          return r.matchMode === targetMode;
        });

    // Live "N WAITING" badge count
    const queueBucket = !isCustomMode && matchMode !== 'practice' && matchMode !== 'vs_bot'
      ? queueSnapshot.find(
          (b) => b.matchMode === (matchMode === 'wagered' ? legacyModeForWager(effectiveWager) : matchMode)
            && b.matchLength === matchLength
            && Math.abs(b.wager - effectiveWager) < 1e-9
        )
      : null;
    const othersWaiting = queueBucket
      ? (queueState === 'searching' ? Math.max(0, queueBucket.count - 1) : queueBucket.count)
      : 0;

    return (
      <>
        {/* MOBILE LANDSCAPE LAYOUT */}
        <div style={{
          position: 'relative', height: '100%', overflow: 'hidden',
          background: 'var(--bg-deep)', display: 'flex', flexDirection: 'column',
          // Safari mobile clips into the URL/notch area — pad the top by the
          // device safe-area inset so the header isn't cropped on iPhones.
          // Plus a fallback 8px so non-iOS landscape browsers also have
          // breathing room.
          paddingTop: 'max(8px, env(safe-area-inset-top, 0px))',
        }}>
          {/* Header strip — bumped to 14px top after JJ's second QA pass
              still showed cropping on the DEPLOY title. lineHeight 1.4 on
              the title gives descender + ascender room (was 1.1, then 0.95). */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 8,
            padding: '14px 12px 8px', borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <button
              onClick={() => { if (queueState === 'searching') cancelQueue(); if (waiting) cancelRoom(); navigate('menu'); }}
              style={{
                fontFamily: 'var(--f-mono)', fontSize: 8, color: 'var(--olive)',
                letterSpacing: '0.25em', background: 'transparent', border: 'none',
                cursor: 'pointer', padding: '2px 4px',
              }}
            >← MENU</button>
            <div style={{
              fontFamily: 'var(--f-display)', fontSize: 18, color: 'var(--bone)',
              letterSpacing: '0.18em', textAlign: 'center', lineHeight: 1.4,
            }}>DEPLOY</div>
            <div style={{
              fontFamily: 'var(--f-mono)', fontSize: 8, color: 'var(--olive)',
              letterSpacing: '0.18em', textAlign: 'right',
            }}>{playerHandle}</div>
          </div>

          {/* Body: 3-column grid */}
          <div style={{
            flex: 1, display: 'grid', gridTemplateColumns: '130px 1fr 160px',
            gap: 10, padding: '8px 10px', minHeight: 0,
          }}>

            {/* LEFT: mode list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
              <div style={mobileModeSectionLabel}>MODE</div>
              {mobileModes.map(m => {
                const locked = !wageredEnabled && m.key !== 'practice' && m.key !== 'vs_bot';
                const isActive = matchMode === m.key;
                return (
                  <button
                    key={m.key}
                    onClick={locked ? undefined : () => setMatchMode(m.key)}
                    style={{
                      padding: '5px 8px',
                      background: isActive ? 'rgba(218,138,40,0.12)' : 'var(--bg-raised)',
                      color: isActive ? 'var(--accent)' : 'var(--bone)',
                      border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                      borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                      clipPath: 'var(--clip-6)',
                      cursor: locked ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      display: 'flex', flexDirection: 'column', gap: 0,
                      opacity: locked ? 0.4 : 1,
                      position: 'relative',
                    }}
                  >
                    <span className="stencil" style={{ fontSize: 10, letterSpacing: '0.15em', lineHeight: 1 }}>{m.label}</span>
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 7, opacity: 0.7, letterSpacing: '0.15em', marginTop: 2 }}>{m.sub}</span>
                    {locked && (
                      <span style={{
                        position: 'absolute', top: -4, right: -2,
                        fontFamily: 'var(--f-mono)', fontSize: 7, letterSpacing: 0.5,
                        color: 'var(--bone)', background: 'var(--bg-deep)',
                        border: '1px solid var(--border)', borderRadius: 2, padding: '1px 3px',
                      }}>SOON</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* MIDDLE: match config */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0, overflowY: 'auto' }}>

              {/* WAGER */}
              {isCustomMode ? (
                <div>
                  <div style={mobileModeSectionLabel}>WAGER</div>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {[0, 0.1, 0.25, 0.5, 1.0].map(tier => (
                      <button
                        key={tier}
                        onClick={() => setCustomWager(tier)}
                        style={mobileChipStyle(customWager === tier, '#ff6600')}
                      >
                        {tier === 0 ? 'FREE' : tier + ' SOL'}
                      </button>
                    ))}
                    <button
                      onClick={() => { if ([0, 0.1, 0.25, 0.5, 1.0].includes(customWager)) setCustomWager(0.2); }}
                      style={mobileChipStyle(![0, 0.1, 0.25, 0.5, 1.0].includes(customWager), '#ff6600')}
                    >CUSTOM</button>
                  </div>
                  {![0, 0.1, 0.25, 0.5, 1.0].includes(customWager) && (
                    <input
                      type="number" min="0.01" step="0.01"
                      value={customWager}
                      onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) setCustomWager(Math.round(v * 100) / 100); }}
                      style={{
                        width: '100%', padding: '5px 8px', marginTop: 4,
                        fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: 1,
                        background: 'rgba(255,102,0,0.08)', border: '1px solid #ff6600',
                        clipPath: 'var(--clip-6)', color: '#ff6600', outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  )}
                </div>
              ) : availableWagers.length > 1 ? (
                <div>
                  <div style={mobileModeSectionLabel}>WAGER</div>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {availableWagers.map(tier => (
                      <button
                        key={tier}
                        onClick={() => { setWager(tier); if (tier > 0 && !localStorage.getItem('solshot_escrow_seen')) setShowEscrow(true); }}
                        style={mobileChipStyle(wager === tier, 'var(--sg)')}
                      >
                        {tier === 0 ? 'FREE' : tier + ' SOL'}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={mobileModeSectionLabel}>WAGER</div>
                  <div style={{
                    fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--sg)',
                    letterSpacing: '0.18em', padding: '3px 0',
                  }}>FREE</div>
                </div>
              )}

              {/* FORMAT */}
              <div>
                <div style={mobileModeSectionLabel}>FORMAT</div>
                <div style={{ display: 'flex', gap: 3 }}>
                  {availableFormats.map(m => (
                    <button
                      key={m.rounds}
                      onClick={() => setMatchLength(m.rounds)}
                      style={mobileChipStyle(matchLength === m.rounds)}
                    >{m.label}</button>
                  ))}
                </div>
              </div>

              {/* TANK COLOR */}
              <div>
                <div style={mobileModeSectionLabel}>TANK COLOR</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {TANK_COLORS.filter((c) => !(matchMode === 'vs_bot' && c.name === 'WHITE')).map((c, i) => {
                    const isClaimed = claimedColors.includes(c.phaserHex);
                    return (
                      <div
                        key={c.id}
                        title={isClaimed ? c.name + ' (taken)' : c.name}
                        onClick={() => !isClaimed && setSelectedColor(i)}
                        style={{
                          width: 20, height: 20,
                          clipPath: 'var(--clip-6)',
                          background: c.hex,
                          border: selectedColor === i ? '2px solid var(--bone)' : '2px solid transparent',
                          cursor: isClaimed ? 'not-allowed' : 'pointer',
                          opacity: isClaimed ? 0.25 : 1,
                          boxShadow: selectedColor === i ? `0 0 6px ${c.hex}` : 'none',
                        }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* CUSTOM CHALLENGE: handle input + send */}
              {isCustomMode && (
                <div>
                  <div style={mobileModeSectionLabel}>CHALLENGE PLAYER</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      type="text"
                      placeholder="CALLSIGN"
                      value={challengeCallsign}
                      onChange={e => setChallengeCallsign(e.target.value.toUpperCase().slice(0, 16))}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && challengeCallsign.trim())
                          window.socket?.emit('challengeCallsign', { callsign: challengeCallsign.trim() });
                      }}
                      style={{
                        flex: 1, padding: '5px 8px',
                        fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: 1,
                        background: 'rgba(42,51,31,0.3)', border: '1px solid var(--border)',
                        clipPath: 'var(--clip-6)', color: 'var(--bone)', outline: 'none',
                        textTransform: 'uppercase',
                      }}
                    />
                    <button
                      onClick={() => { if (challengeCallsign.trim()) window.socket?.emit('challengeCallsign', { callsign: challengeCallsign.trim() }); }}
                      style={{ ...mobileChipStyle(false), padding: '5px 10px', fontSize: 9 }}
                    >SEND</button>
                  </div>
                  {challengeSentTo && (
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 8, color: 'var(--accent)', letterSpacing: '0.18em', marginTop: 3, animation: 'fl 2s ease-in-out infinite' }}>
                      CHALLENGE SENT TO {challengeSentTo}...
                    </div>
                  )}
                </div>
              )}

              {/* OPEN LOBBIES (middle column, below config, non-custom modes) */}
              {!isCustomMode && (
                <div style={{ marginTop: 4 }}>
                  <div style={mobileModeSectionLabel}>
                    OPEN LOBBIES{filteredRooms.length > 0 ? ' · ' + filteredRooms.length : ''}
                  </div>
                  {filteredRooms.length === 0 ? (
                    <div style={{
                      fontFamily: 'var(--f-mono)', fontSize: 8, color: 'var(--olive)',
                      letterSpacing: '0.15em', opacity: 0.5, padding: '4px 0',
                    }}>NO OPEN LOBBIES</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {filteredRooms.slice(0, 4).map(room => (
                        <div key={room.roomId} style={{
                          display: 'grid', gridTemplateColumns: '1fr auto auto auto',
                          alignItems: 'center', gap: 4, padding: '3px 5px',
                          background: 'var(--bg-raised)', borderLeft: '2px solid var(--accent)',
                          fontFamily: 'var(--f-mono)', fontSize: 7, letterSpacing: '0.12em',
                        }}>
                          <span style={{ color: 'var(--bone)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {room.host?.name || 'UNKNOWN'}
                          </span>
                          <span style={{ color: 'var(--accent)', flexShrink: 0 }}>
                            {room.wager > 0 ? room.wager + ' SOL' : 'FREE'}
                          </span>
                          <span style={{ color: 'var(--olive)', flexShrink: 0 }}>
                            {(room.currentPlayers || 1) + '/' + (room.maxPlayers || 2)}
                          </span>
                          <button
                            onClick={() => setConfirmJoin({
                              roomId: room.roomId,
                              hostName: room.host?.name || 'UNKNOWN',
                              mode: MATCH_MODES[room.matchMode]?.label || 'MATCH',
                              format: 'BO' + (room.totalRounds || 1),
                            })}
                            style={{
                              padding: '2px 5px', background: 'transparent', color: 'var(--accent)',
                              border: '1px solid var(--accent)', fontFamily: 'var(--f-mono)', fontSize: 7,
                              letterSpacing: '0.18em', cursor: 'pointer',
                            }}
                          >JOIN</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* CUSTOM CHALLENGE: share panel (appears after challengeCreated) */}
              {isCustomMode && challengeShortCode && challengeDeepLink && waitingRoomPlayers.length < waitingRoomMax && (
                <div style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--accent)',
                  padding: '8px 10px', clipPath: 'var(--clip-6)',
                }}>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 8, color: 'var(--accent)', letterSpacing: '0.22em', marginBottom: 5 }}>
                    CHALLENGE · CH-#{challengeShortCode}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                    <button
                      onClick={() => {
                        const tg = window.Telegram?.WebApp;
                        if (tg?.switchInlineQuery) {
                          tg.switchInlineQuery('ch_' + challengeShortCode, ['users', 'groups']);
                        } else if (navigator.share) {
                          navigator.share({ title: 'SolShot Challenge', url: challengeDeepLink }).catch(() => {});
                        } else {
                          window.open('https://t.me/share/url?url=' + encodeURIComponent(challengeDeepLink), '_blank');
                        }
                      }}
                      style={{
                        padding: '7px 8px', background: 'var(--accent)', color: '#0e1209',
                        border: '1px solid var(--accent-hot)', clipPath: 'var(--clip-6)',
                        fontFamily: 'var(--f-display)', fontSize: 9, letterSpacing: '0.18em', cursor: 'pointer',
                      }}
                    >SEND CARD</button>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(challengeDeepLink)
                          .then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1800); })
                          .catch(() => {});
                      }}
                      style={{
                        padding: '7px 8px', background: 'transparent', color: 'var(--bone)',
                        border: '1px solid var(--border)', clipPath: 'var(--clip-6)',
                        fontFamily: 'var(--f-display)', fontSize: 9, letterSpacing: '0.18em', cursor: 'pointer',
                      }}
                    >{linkCopied ? '✓ COPIED' : 'COPY LINK'}</button>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: summary card + CTA */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
              <div style={mobileModeSectionLabel}>SUMMARY</div>

              {/* Summary card */}
              <div style={{
                padding: '8px 8px', background: 'var(--bg-raised)', border: '1px solid var(--border)',
                clipPath: 'var(--clip-6)', fontFamily: 'var(--f-mono)', fontSize: 8,
                letterSpacing: '0.12em', lineHeight: 1.9,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--olive)' }}>MODE</span>
                  <span style={{ color: 'var(--bone)' }}>{MATCH_MODES[matchMode]?.label || matchMode}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--olive)' }}>FORMAT</span>
                  <span style={{ color: 'var(--bone)' }}>{'BO' + matchLength}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--olive)' }}>WAGER</span>
                  <span style={{ color: effectiveWager > 0 ? 'var(--sg)' : 'var(--olive)' }}>{summaryWagerLabel}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--olive)' }}>COLOR</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, background: TANK_COLORS[selectedColor]?.hex, borderRadius: 1 }} />
                    <span style={{ color: 'var(--bone)' }}>{TANK_COLORS[selectedColor]?.name || ''}</span>
                  </span>
                </div>
                {effectiveWager > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--olive)' }}>POT</span>
                    <span style={{ color: 'var(--accent)' }}>{(effectiveWager * (numPlayers || 2)).toFixed(2)} SOL</span>
                  </div>
                )}
              </div>

              {/* Primary CTA */}
              {isCustomMode ? (
                <ScanBtn
                  height={40}
                  fontSize={13}
                  onClick={createRoom}
                  style={{ marginBottom: 0 }}
                >
                  {customWager > 0 ? 'CREATE · ' + customWager + ' SOL' : 'CREATE FREE'}
                </ScanBtn>
              ) : matchMode === 'practice' || matchMode === 'vs_bot' ? (
                <ScanBtn
                  height={40}
                  fontSize={13}
                  onClick={createRoom}
                  style={{ marginBottom: 0 }}
                >
                  {matchMode === 'vs_bot' ? 'VS BOT' : 'CREATE MATCH'}
                </ScanBtn>
              ) : (
                <ScanBtn
                  height={40}
                  fontSize={13}
                  onClick={findOrCreateMatch}
                  style={{ marginBottom: 0 }}
                >
                  FIND MATCH
                </ScanBtn>
              )}

              {/* Wager indicator */}
              <div style={{
                fontFamily: 'var(--f-mono)', fontSize: 8, color: modeConfig.color,
                letterSpacing: '0.15em', textAlign: 'center', opacity: 0.85,
              }}>
                {effectiveWager > 0 ? '◆ ' + effectiveWager + ' SOL' : '◆ FREE MATCH'}
              </div>

              {/* N WAITING badge */}
              {othersWaiting > 0 && (
                <div style={{
                  fontFamily: 'var(--f-mono)', fontSize: 8, color: 'var(--gg, #14F195)',
                  letterSpacing: '0.18em', textAlign: 'center',
                }}>
                  {'● ' + othersWaiting + ' WAITING'}
                </div>
              )}

              {/* Lobbies count link (non-custom) */}
              {!isCustomMode && rooms.length > 0 && (
                <div style={{
                  fontFamily: 'var(--f-mono)', fontSize: 7, color: 'var(--olive)',
                  letterSpacing: '0.18em', textAlign: 'center', opacity: 0.7,
                }}>
                  {rooms.length + ' OPEN ' + (rooms.length === 1 ? 'LOBBY' : 'LOBBIES')}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── MOBILE WAITING OVERLAY ── */}
        {waiting && (
          <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(10, 12, 8, 0.88)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            zIndex: 30, gap: 10,
          }}>
            <div style={{
              fontFamily: 'var(--f-display)', fontSize: 18, color: 'var(--accent)',
              letterSpacing: '0.15em', animation: 'fl 2s ease-in-out infinite',
            }}>
              {waitingRoomPlayers.length >= waitingRoomMax
                ? waitingRoomPlayers.length + '/' + waitingRoomMax + ' PLAYERS'
                : 'AWAITING OPPONENT...'}
            </div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)', letterSpacing: '0.18em' }}>
              {modeConfig.label + ' / BO' + matchLength + (effectiveWager > 0 ? ' / ' + effectiveWager + ' SOL' : '')}
              {depositStatuses.length > 0 && effectiveWager > 0 && (
                <span>{' · ' + depositStatuses.filter(d => d.confirmed).length + '/' + depositStatuses.length + ' DEPOSITED'}</span>
              )}
            </div>
            {depositCountdown !== null && (
              <div style={{
                fontFamily: 'var(--f-mono)', fontSize: depositCountdown <= 30 ? 16 : 12,
                color: depositCountdown <= 30 ? '#ff6644' : 'var(--olive)',
                letterSpacing: '0.18em',
                animation: depositCountdown <= 10 ? 'fl 1s ease-in-out infinite' : 'none',
              }}>
                {Math.floor(depositCountdown / 60) + ':' + String(depositCountdown % 60).padStart(2, '0') + ' ' + (partialDepositInfo ? 'DECISION TIME' : 'DEPOSIT WINDOW')}
              </div>
            )}
            {partialDepositInfo && isDecisionMaker && (
              <div style={{ display: 'flex', gap: 8 }}>
                {partialDepositInfo.canStart && (
                  <button
                    onClick={handlePartialStart}
                    style={{ ...mobileChipStyle(true), padding: '8px 14px', fontSize: 11 }}
                  >{'START WITH ' + partialDepositInfo.numDeposited}</button>
                )}
                <button
                  onClick={handleCancelAll}
                  style={{ ...mobileChipStyle(false), padding: '8px 14px', fontSize: 11 }}
                >CANCEL & REFUND</button>
              </div>
            )}
            <button
              onClick={cancelRoom}
              style={{ ...mobileChipStyle(false), padding: '8px 18px', fontSize: 11, marginTop: 4 }}
            >CANCEL</button>
          </div>
        )}

        {/* ── MOBILE QUEUE SEARCHING OVERLAY ── */}
        {queueState === 'searching' && (
          <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(10, 12, 8, 0.88)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            zIndex: 30, gap: 10,
          }}>
            <div style={{
              fontFamily: 'var(--f-display)', fontSize: 18, color: 'var(--accent)',
              letterSpacing: '0.15em', animation: 'fl 2s ease-in-out infinite',
            }}>SEARCHING...</div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)', letterSpacing: '0.18em' }}>
              {modeConfig.label + ' / BO' + matchLength + (effectiveWager > 0 ? ' / ' + effectiveWager + ' SOL' : ' / FREE')}
            </div>
            <button
              onClick={cancelQueue}
              style={{ ...mobileChipStyle(false), padding: '8px 18px', fontSize: 11, marginTop: 4 }}
            >CANCEL</button>
          </div>
        )}

        {/* ── MODALS (reuse desktop modal components) ── */}
        {error && (
          <Modal title="ERROR" message={error}
            buttons={[{ label: 'DISMISS', variant: 'secondary', onClick: () => setError(null) }]}
            onClose={() => setError(null)}
          />
        )}
        {showEscrow && (
          <Modal title="HOW WAGERING WORKS"
            message="Your SOL is held by a smart contract (escrow) during the match. The winner receives 90% of the pot. Neither player nor SolShot can access funds during the match. If your opponent disconnects, you get a full refund."
            buttons={[{ label: 'GOT IT', variant: 'primary', onClick: () => { localStorage.setItem('solshot_escrow_seen', 'true'); setShowEscrow(false); } }]}
            onClose={() => { localStorage.setItem('solshot_escrow_seen', 'true'); setShowEscrow(false); }}
          />
        )}
        {kickedMessage && (
          <Modal title="REMOVED FROM MATCH" message={kickedMessage}
            buttons={[{ label: 'RETURN TO MENU', variant: 'secondary', onClick: () => { setKickedMessage(null); navigate('menu'); } }]}
            onClose={() => { setKickedMessage(null); navigate('menu'); }}
          />
        )}
        {incomingChallenge && (
          <Modal title="INCOMING CHALLENGE"
            message={incomingChallenge.fromCallsign + ' wants to battle you!'}
            buttons={[
              { label: 'ACCEPT', variant: 'primary', onClick: () => { window.socket?.emit('acceptChallenge', { fromSocketId: incomingChallenge.fromSocketId }); setIncomingChallenge(null); } },
              { label: 'DECLINE', variant: 'secondary', onClick: () => { window.socket?.emit('declineChallenge', { fromSocketId: incomingChallenge.fromSocketId }); setIncomingChallenge(null); } },
            ]}
            onClose={() => { window.socket?.emit('declineChallenge', { fromSocketId: incomingChallenge.fromSocketId }); setIncomingChallenge(null); }}
          />
        )}
        {confirmJoin && (
          <Modal title="JOIN MATCH?"
            message={confirmJoin.hostName + ' — ' + confirmJoin.mode + ' / ' + confirmJoin.format}
            buttons={[
              { label: 'YES', variant: 'primary', onClick: () => { joinRoom(confirmJoin.roomId); setConfirmJoin(null); } },
              { label: 'NO', variant: 'secondary', onClick: () => setConfirmJoin(null) },
            ]}
            onClose={() => setConfirmJoin(null)}
          />
        )}
        {matchFound && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(10,12,8,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}>
            <div style={{
              fontFamily: 'var(--f-display)', fontSize: 28, color: 'var(--accent)',
              letterSpacing: '0.18em', animation: 'fl 1s ease-in-out infinite',
              textShadow: '0 0 20px rgba(218,138,40,0.4)',
            }}>MATCH FOUND</div>
          </div>
        )}
      </>
    );
  }
  // ── END MOBILE BRANCH ─────────────────────────────────────────────────

  return (
    <>
      <TopBar title="DEPLOY" onBack={() => {
        if (queueState === 'searching') cancelQueue();
        if (waiting) cancelRoom();
        navigate('menu');
      }} />

      <div style={s.container}>
        {/* ═══ LEFT PANEL ═══ */}
        <div style={s.left}>
          {/* Match Mode */}
          <div>
            <div style={s.sectionLabel}>MODE</div>
            <div style={s.modeRow}>
              {MODE_KEYS.map((key) => {
                // Wagered modes are gated until we explicitly enable them
                // (devnet testing first, then graduated mainnet rollout per
                // the research synthesis: $5 → $25 → $50 → 1 SOL cap ladder).
                // Set REACT_APP_WAGERED_ENABLED=true in Vercel env to unlock.
                const wageredEnabled = process.env.REACT_APP_WAGERED_ENABLED === 'true';
                const locked = !wageredEnabled && key !== 'practice';
                return (
                  <div
                    key={key}
                    style={{
                      ...s.modeBtn(matchMode === key, MATCH_MODES[key].color),
                      ...(locked ? { opacity: 0.4, cursor: 'not-allowed', position: 'relative' } : {}),
                    }}
                    onClick={locked ? undefined : () => setMatchMode(key)}
                  >
                    {MATCH_MODES[key].label}
                    {locked && (
                      <span style={{
                        position: 'absolute',
                        top: -7,
                        right: -4,
                        fontFamily: "'Share Tech Mono', monospace",
                        fontSize: 8,
                        letterSpacing: 0.5,
                        color: 'var(--bn)',
                        background: 'var(--sd)',
                        border: '1px solid var(--st)',
                        borderRadius: 2,
                        padding: '1px 4px',
                      }}>SOON</span>
                    )}
                  </div>
                );
              })}
            </div>
            {matchMode === 'practice' && (
              <div style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 11,
                color: 'var(--sg)',
                opacity: 0.8,
                letterSpacing: 2,
                marginTop: 4,
                textTransform: 'uppercase',
              }}>
                FREE PRACTICE MODE
              </div>
            )}
            {matchMode === 'vs_bot' && (
              <div style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 11,
                color: 'var(--kh)',
                opacity: 0.85,
                letterSpacing: 2,
                marginTop: 4,
                textTransform: 'uppercase',
              }}>
                SOLO VS AI · NO STAKES · OFFLINE
              </div>
            )}
          </div>

          {/* Match Length */}
          <div>
            <div style={s.sectionLabel}>FORMAT</div>
            <div style={s.matchRow}>
              {availableFormats.map((m) => (
                <div
                  key={m.rounds}
                  style={s.matchBtn(matchLength === m.rounds)}
                  onClick={() => setMatchLength(m.rounds)}
                >
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          {/* Player Count — hidden for practice-only launch */}

          {/* Wager — custom mode uses preset tier buttons + a CUSTOM option that reveals
              a numeric input. Picking FREE creates a no-wager practice challenge (no
              wallet auth required). 0.1+ tiers require wallet auth on createChallengeRoom. */}
          {isCustomMode ? (
            <div>
              <div style={s.sectionLabel}>WAGER</div>
              <div style={s.sublabel}>FREE OR PICK A TIER · CUSTOM FOR ANY AMOUNT</div>
              <div style={{ ...s.wagerRow, flexWrap: 'wrap', gap: 4 }}>
                {[0, 0.1, 0.25, 0.5, 1.0].map((tier) => (
                  <div
                    key={tier}
                    style={s.wagerBtn(customWager === tier)}
                    onClick={() => setCustomWager(tier)}
                  >
                    {tier === 0 ? 'FREE' : tier + ' SOL'}
                  </div>
                ))}
                <div
                  style={s.wagerBtn(![0, 0.1, 0.25, 0.5, 1.0].includes(customWager))}
                  onClick={() => {
                    if ([0, 0.1, 0.25, 0.5, 1.0].includes(customWager)) setCustomWager(0.2);
                  }}
                >
                  CUSTOM
                </div>
              </div>
              {![0, 0.1, 0.25, 0.5, 1.0].includes(customWager) && (
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={customWager}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0) setCustomWager(Math.round(val * 100) / 100);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    marginTop: 8,
                    fontFamily: "'Share Tech Mono', monospace",
                    fontSize: 14,
                    letterSpacing: 1,
                    background: 'rgba(255, 102, 0, 0.08)',
                    border: '1px solid #ff6600',
                    clipPath: 'var(--clip-6)',
                    color: '#ff6600',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              )}
            </div>
          ) : availableWagers.length > 1 ? (
            <div>
              <div style={s.sectionLabel}>WAGER</div>
              <div style={s.sublabel}>SOL STAKE PER MATCH</div>
              <div style={s.wagerRow}>
                {availableWagers.map((tier) => (
                  <div
                    key={tier}
                    style={s.wagerBtn(wager === tier)}
                    onClick={() => {
                      setWager(tier);
                      if (tier > 0 && !localStorage.getItem('solshot_escrow_seen')) {
                        setShowEscrow(true);
                      }
                    }}
                  >
                    {tier === 0 ? 'FREE' : tier + ' SOL'}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Color Picker — white reserved for Shot Bot in vs_bot mode */}
          <div>
            <div style={s.sectionLabel}>TANK COLOR</div>
            <div style={s.colorRow}>
              {TANK_COLORS.filter((c) => !(matchMode === 'vs_bot' && c.name === 'WHITE')).map((c, i) => {
                const isClaimed = claimedColors.includes(c.phaserHex);
                return (
                  <div
                    key={c.id}
                    style={{
                      ...s.colorSwatch(c.hex, selectedColor === i),
                      opacity: isClaimed ? 0.25 : 1,
                      cursor: isClaimed ? 'not-allowed' : 'pointer',
                    }}
                    onClick={() => !isClaimed && setSelectedColor(i)}
                    title={isClaimed ? c.name + ' (taken)' : c.name}
                  />
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={s.quickBtns}>
            {isCustomMode ? (
              <Button variant="primary" onClick={createRoom} style={{ fontSize: 15, padding: '12px 20px', borderColor: '#ff6600', color: '#ff6600' }}>
                {customWager > 0 ? `CREATE CHALLENGE · ${customWager} SOL` : 'CREATE FREE CHALLENGE'}
              </Button>
            ) : matchMode === 'practice' ? (
              <Button variant="primary" onClick={createRoom} style={{ fontSize: 15, padding: '12px 20px' }}>
                CREATE MATCH
              </Button>
            ) : (
              // Wagered modes (Quick Match, Duel, High Roller) — use the
              // find-or-create unified flow so wagered rooms appear in
              // the OPEN LOBBIES pane while still auto-pairing instantly
              // when a matching lobby already exists.
              <Button variant="primary" onClick={findOrCreateMatch} style={{ fontSize: 15, padding: '12px 20px' }}>
                {'FIND ' + modeConfig.label}
              </Button>
            )}
            <div style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 13,
              color: modeConfig.color,
              letterSpacing: 1,
              textAlign: 'center',
              opacity: 0.8,
            }}>
              {effectiveWager > 0 ? '◆ ' + effectiveWager + ' SOL WAGER' : '◆ FREE MATCH'}
            </div>
            {/* Live "N WAITING" badge — only shown for queue-backed modes
                (not custom_challenge, not practice) and only when at least
                one OTHER player is queued for this exact (mode, length,
                wager) combo. Subtracts 1 from the count when this client
                is also queued so we don't count themselves. */}
            {!isCustomMode && matchMode !== 'practice' && (() => {
              const bucket = queueSnapshot.find(
                (b) => b.matchMode === matchMode
                  && b.matchLength === matchLength
                  && Math.abs(b.wager - effectiveWager) < 1e-9
              );
              const total = bucket?.count || 0;
              const others = queueState === 'searching' ? Math.max(0, total - 1) : total;
              if (others <= 0) return null;
              return (
                <div style={{
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: 11,
                  color: 'var(--gg, #14F195)',
                  letterSpacing: '0.18em',
                  textAlign: 'center',
                  marginTop: 4,
                }}>
                  {`● ${others} WAITING`}
                </div>
              );
            })()}
          </div>

          {/* Challenge by Callsign */}
          <div>
            <div style={s.sectionLabel}>CHALLENGE PLAYER</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                placeholder="ENTER CALLSIGN"
                value={challengeCallsign}
                onChange={(e) => setChallengeCallsign(e.target.value.toUpperCase().slice(0, 16))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && challengeCallsign.trim()) {
                    window.socket?.emit('challengeCallsign', { callsign: challengeCallsign.trim() });
                  }
                }}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: 13,
                  letterSpacing: 2,
                  background: 'rgba(42, 51, 31, 0.3)',
                  border: '1px solid var(--ol)',
                  clipPath: 'var(--clip-6)',
                  color: 'var(--bn)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  textTransform: 'uppercase',
                }}
              />
              <Button
                variant="secondary"
                onClick={() => {
                  if (challengeCallsign.trim()) {
                    window.socket?.emit('challengeCallsign', { callsign: challengeCallsign.trim() });
                  }
                }}
                style={{ fontSize: 12, padding: '8px 14px', letterSpacing: 1, whiteSpace: 'nowrap' }}
              >
                SEND
              </Button>
            </div>
            {challengeSentTo && (
              <div style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 11,
                color: 'var(--am)',
                letterSpacing: 1,
                marginTop: 4,
                animation: 'fl 2s ease-in-out infinite',
              }}>
                CHALLENGE SENT TO {challengeSentTo}...
              </div>
            )}
          </div>
        </div>

        {/* ═══ RIGHT PANEL ═══ */}
        <div style={s.right}>
          <div style={s.roomListHeader}>
            OPEN LOBBIES
            <span style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 13,
              color: 'var(--kh)',
              marginLeft: 8,
              letterSpacing: 1,
              opacity: 0.6,
            }}>
              {rooms.length > 0 ? rooms.length + ' ACTIVE' : ''}
            </span>
          </div>

          <div style={s.roomList}>
            {rooms.length === 0 ? (
              /* Empty state: search icon, NO LOBBIES MATCH copy, dual
                 CTAs (CREATE LOBBY = host this match, CLEAR FILTERS =
                 reset mode/wager/format selectors). Wrapped in a
                 position:relative parent so EmptyState's inset:0
                 fill works inside the existing roomList layout. */
              <div style={{ position: 'relative', flex: 1, minHeight: 240 }}>
                <EmptyState
                  icon="search"
                  title="NO LOBBIES MATCH"
                  body="NO OPEN LOBBIES FIT YOUR FILTERS. CREATE ONE OR LOOSEN THE CRITERIA."
                  density="compact"
                />
              </div>
            ) : (
              rooms.map((room) => {
                const rMode = room.matchMode && MATCH_MODES[room.matchMode]
                  ? MATCH_MODES[room.matchMode]
                  : null;
                return (
                  <div key={room.roomId} style={s.roomCard}>
                    <div style={s.roomInfo}>
                      <div style={s.hostColor(getColorHex(room.host?.color))} />
                      <span style={s.hostName}>
                        {room.host?.name || 'UNKNOWN'}
                      </span>
                      {(room.currentPlayers || 1) < (room.maxPlayers || 2) && (
                        <span style={{
                          fontFamily: "'Share Tech Mono', monospace",
                          fontSize: 9,
                          letterSpacing: 1,
                          padding: '1px 5px',
                          borderRadius: 2,
                          color: 'var(--am)',
                          border: '1px solid rgba(255,191,0,0.25)',
                          background: 'rgba(255,191,0,0.06)',
                          flexShrink: 0,
                          animation: 'fl 2s ease-in-out infinite',
                        }}>WAITING</span>
                      )}
                      <span style={{
                        fontFamily: "'Share Tech Mono', monospace",
                        fontSize: 11,
                        letterSpacing: 1,
                        padding: '2px 6px',
                        borderRadius: 2,
                        color: 'var(--kh)',
                        border: '1px solid rgba(184, 168, 138, 0.15)',
                        flexShrink: 0,
                      }}>
                        {(room.currentPlayers || 1) + '/' + (room.maxPlayers || 2)}
                      </span>
                    </div>

                    {rMode && (
                      <div style={s.modeBadge(rMode.color)}>
                        {rMode.label}
                      </div>
                    )}

                    <div style={s.formatBadge}>
                      {'BO' + (room.totalRounds || 1)}
                    </div>

                    <div style={s.wagerBadge(room.wager || 0)}>
                      {formatWagerWithPayout(room.wager || 0, room.maxPlayers || 2)}
                    </div>

                    <Button
                      variant="secondary"
                      onClick={() => setConfirmJoin({
                        roomId: room.roomId,
                        hostName: room.host?.name || 'UNKNOWN',
                        mode: rMode?.label || 'MATCH',
                        format: 'BO' + (room.totalRounds || 1),
                      })}
                      style={{ fontSize: 13, padding: '6px 14px', letterSpacing: 2 }}
                    >
                      CHALLENGE
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ═══ WAITING OVERLAY (manual room / custom_challenge) ═══ */}
      {/* Phase 3 — Telegram challenge share panel.
          Shown when /challenge auto-create has produced a shortCode and the room
          is still waiting for the opponent to accept. */}
      {challengeShortCode && challengeDeepLink && waitingRoomPlayers.length < waitingRoomMax && (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--accent)',
          padding: '14px 16px', margin: '14px auto',
          clipPath: 'var(--clip-10)',
          maxWidth: 480,
        }}>
          <div style={{
            fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--accent)',
            letterSpacing: '0.22em', textAlign: 'center', marginBottom: 8,
          }}>CHALLENGE · CH-#{challengeShortCode}</div>
          <div style={{
            fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--bone)',
            letterSpacing: '0.05em', textAlign: 'center', marginBottom: 12,
            wordBreak: 'break-all',
          }}>{challengeDeepLink.replace('https://', '')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              onClick={() => {
                const tg = window.Telegram?.WebApp;
                if (tg?.switchInlineQuery) {
                  tg.switchInlineQuery('ch_' + challengeShortCode, ['users', 'groups']);
                } else if (navigator.share) {
                  navigator.share({ title: 'SolShot Challenge', url: challengeDeepLink }).catch(() => {});
                } else {
                  window.open('https://t.me/share/url?url=' + encodeURIComponent(challengeDeepLink), '_blank');
                }
              }}
              style={{
                padding: '10px', background: 'var(--accent)', color: '#0e1209',
                border: '1px solid var(--accent-hot)', clipPath: 'var(--clip-6)',
                fontFamily: 'var(--f-display)', fontSize: 11, letterSpacing: '0.18em',
                cursor: 'pointer', boxShadow: '0 0 12px rgba(218,138,40,0.25)',
              }}>SEND CARD</button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(challengeDeepLink)
                  .then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1800); })
                  .catch(() => {});
              }}
              style={{
                padding: '10px', background: 'transparent', color: 'var(--bone)',
                border: '1px solid var(--border)', clipPath: 'var(--clip-6)',
                fontFamily: 'var(--f-display)', fontSize: 11, letterSpacing: '0.18em',
                cursor: 'pointer',
              }}>{linkCopied ? '✓ COPIED' : 'COPY LINK'}</button>
          </div>
          <div style={{
            fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--olive)',
            letterSpacing: '0.22em', textAlign: 'center', marginTop: 10,
          }}>WAITING FOR OPPONENT</div>
        </div>
      )}

      {waiting && (
        <div style={s.waitingOverlay}>
          <div style={s.waitingText}>
            {waitingRoomPlayers.length >= waitingRoomMax ? waitingRoomPlayers.length + '/' + waitingRoomMax + ' PLAYERS' : 'AWAITING OPPONENT...'}
          </div>
          {waitingRoomPlayers.length < waitingRoomMax && (
            <div style={s.waitingSubtext}>
              {waitingRoomPlayers.length + '/' + waitingRoomMax + ' PLAYERS'}
            </div>
          )}
          <div style={s.waitingSubtext}>
            {modeConfig.label + ' / BO' + matchLength + (effectiveWager > 0 ? ' / ' + effectiveWager + ' SOL' : '')}
            {depositStatuses.length > 0 && effectiveWager > 0 && (
              <span>{' -- ' + depositStatuses.filter(d => d.confirmed).length + '/' + depositStatuses.length + ' DEPOSITED'}</span>
            )}
          </div>

          {/* Player slots */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            width: 260,
            marginTop: 8,
          }}>
            {Array.from({ length: waitingRoomMax }).map((_, i) => {
              const p = waitingRoomPlayers[i];
              return (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  background: p ? 'rgba(42, 51, 31, 0.4)' : 'rgba(42, 51, 31, 0.15)',
                  border: p ? '1px solid var(--ol)' : '1px dashed rgba(184, 168, 138, 0.2)',
                  clipPath: 'var(--clip-6)',
                }}>
                  {p ? (
                    <>
                      <div style={{
                        width: 12,
                        height: 12,
                        borderRadius: 2,
                        background: getColorHex(p.color),
                        flexShrink: 0,
                      }} />
                      <span style={{
                        fontFamily: "'Share Tech Mono', monospace",
                        fontSize: 13,
                        color: 'var(--bn)',
                        letterSpacing: 1,
                        flex: 1,
                      }}>
                        {(p.isHost ? '[HOST] ' : '') + (p.name || 'UNKNOWN')}
                      </span>
                      {p.socketId === (window.socket && window.socket.id) && (
                        <span style={{
                          fontFamily: "'Share Tech Mono', monospace",
                          fontSize: 10,
                          color: 'var(--sg)',
                          letterSpacing: 1,
                        }}>YOU</span>
                      )}
                      {/* Deposit status badge — only shown when escrow deposit phase is active */}
                      {depositStatuses.length > 0 && (() => {
                        const ds = depositStatuses.find(d => d.socketId === p.socketId);
                        if (!ds) return null;
                        return (
                          <span style={{
                            fontFamily: "'Share Tech Mono', monospace",
                            fontSize: 11,
                            letterSpacing: 1,
                            color: ds.confirmed ? 'var(--sg)' : 'var(--am)',
                            marginLeft: 'auto',
                          }}>
                            {ds.confirmed ? 'DEPOSITED' : 'PENDING...'}
                          </span>
                        );
                      })()}
                    </>
                  ) : (
                    <span style={{
                      fontFamily: "'Share Tech Mono', monospace",
                      fontSize: 12,
                      color: 'var(--kh)',
                      letterSpacing: 2,
                      opacity: 0.35,
                    }}>
                      -- WAITING --
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Countdown timer — driven by server depositDeadlineMs */}
          {depositCountdown !== null && (
            <div style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: depositCountdown <= 30 ? 18 : 14,
              color: depositCountdown <= 30 ? '#ff6644' : 'var(--kh)',
              letterSpacing: 2,
              marginTop: 4,
              animation: depositCountdown <= 10 ? 'fl 1s ease-in-out infinite' : 'none',
            }}>
              {Math.floor(depositCountdown / 60) + ':' + String(depositCountdown % 60).padStart(2, '0') + ' ' + (partialDepositInfo ? 'DECISION TIME' : 'DEPOSIT WINDOW')}
            </div>
          )}

          {/* Partial deposit decision panel */}
          {partialDepositInfo && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              marginTop: 8,
              padding: '12px 16px',
              background: 'rgba(42, 51, 31, 0.4)',
              border: '1px solid var(--ol)',
              clipPath: 'var(--clip-6)',
              width: 260,
            }}>
              <div style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 13,
                color: 'var(--am)',
                letterSpacing: 1,
                textAlign: 'center',
              }}>
                {partialDepositInfo.numDeposited + '/' + partialDepositInfo.totalPlayers + ' PLAYERS DEPOSITED'}
              </div>
              {isDecisionMaker ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  {partialDepositInfo.canStart && (
                    <Button
                      variant="primary"
                      onClick={handlePartialStart}
                      style={{ fontSize: 13, padding: '8px 16px' }}
                    >
                      {'START WITH ' + partialDepositInfo.numDeposited}
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    onClick={handleCancelAll}
                    style={{ fontSize: 13, padding: '8px 16px' }}
                  >
                    CANCEL AND REFUND
                  </Button>
                </div>
              ) : partialDepositInfo.waitingForDecision ? (
                <div style={{
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: 12,
                  color: 'var(--kh)',
                  letterSpacing: 1,
                  opacity: 0.7,
                  animation: 'fl 2s ease-in-out infinite',
                }}>
                  WAITING FOR HOST DECISION...
                </div>
              ) : null}
            </div>
          )}

          <Button
            variant="secondary"
            onClick={cancelRoom}
            style={{ fontSize: 14, padding: '10px 24px', marginTop: 8 }}
          >
            CANCEL
          </Button>
        </div>
      )}

      {/* ═══ QUEUE SEARCHING OVERLAY (standard modes) ═══ */}
      {queueState === 'searching' && (
        <div style={s.waitingOverlay}>
          <div style={s.waitingText}>SEARCHING FOR OPPONENT...</div>
          <div style={s.waitingSubtext}>
            {modeConfig.label + ' / BO' + matchLength + (effectiveWager > 0 ? ' / ' + effectiveWager + ' SOL' : ' / FREE')}
          </div>
          <Button
            variant="secondary"
            onClick={cancelQueue}
            style={{ fontSize: 14, padding: '10px 24px', marginTop: 8 }}
          >
            CANCEL
          </Button>
        </div>
      )}

      {/* ═══ ERROR MODAL ═══ */}
      {error && (
        <Modal
          title="ERROR"
          message={error}
          buttons={[
            {
              label: 'DISMISS',
              variant: 'secondary',
              onClick: () => setError(null),
            },
          ]}
          onClose={() => setError(null)}
        />
      )}

      {/* ═══ ESCROW EXPLAINER MODAL (one-time, first wager > 0) ═══ */}
      {showEscrow && (
        <Modal
          title="HOW WAGERING WORKS"
          message="Your SOL is held by a smart contract (escrow) during the match. The winner receives 90% of the pot. Neither player nor SolShot can access funds during the match. If your opponent disconnects, you get a full refund."
          buttons={[{
            label: 'GOT IT',
            variant: 'primary',
            onClick: () => {
              localStorage.setItem('solshot_escrow_seen', 'true');
              setShowEscrow(false);
            }
          }]}
          onClose={() => {
            localStorage.setItem('solshot_escrow_seen', 'true');
            setShowEscrow(false);
          }}
        />
      )}

      {/* ═══ KICKED MODAL (non-depositor removed from room) ═══ */}
      {kickedMessage && (
        <Modal
          title="REMOVED FROM MATCH"
          message={kickedMessage}
          buttons={[{
            label: 'RETURN TO MENU',
            variant: 'secondary',
            onClick: () => {
              setKickedMessage(null);
              navigate('menu');
            },
          }]}
          onClose={() => {
            setKickedMessage(null);
            navigate('menu');
          }}
        />
      )}

      {/* ═══ INCOMING CHALLENGE MODAL ═══ */}
      {incomingChallenge && (
        <Modal
          title="INCOMING CHALLENGE"
          message={incomingChallenge.fromCallsign + ' wants to battle you!'}
          buttons={[
            {
              label: 'ACCEPT',
              variant: 'primary',
              onClick: () => {
                window.socket?.emit('acceptChallenge', { fromSocketId: incomingChallenge.fromSocketId });
                setIncomingChallenge(null);
              },
            },
            {
              label: 'DECLINE',
              variant: 'secondary',
              onClick: () => {
                window.socket?.emit('declineChallenge', { fromSocketId: incomingChallenge.fromSocketId });
                setIncomingChallenge(null);
              },
            },
          ]}
          onClose={() => {
            window.socket?.emit('declineChallenge', { fromSocketId: incomingChallenge.fromSocketId });
            setIncomingChallenge(null);
          }}
        />
      )}

      {/* ═══ JOIN CONFIRMATION MODAL ═══ */}
      {confirmJoin && (
        <Modal
          title="JOIN MATCH?"
          message={confirmJoin.hostName + ' — ' + confirmJoin.mode + ' / ' + confirmJoin.format}
          buttons={[
            {
              label: 'YES',
              variant: 'primary',
              onClick: () => {
                joinRoom(confirmJoin.roomId);
                setConfirmJoin(null);
              },
            },
            {
              label: 'NO',
              variant: 'secondary',
              onClick: () => setConfirmJoin(null),
            },
          ]}
          onClose={() => setConfirmJoin(null)}
        />
      )}

      {/* ═══ MATCH FOUND FLASH ═══ */}
      {matchFound && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(10, 12, 8, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
        }}>
          <div style={{
            fontFamily: "'Black Ops One', cursive",
            fontSize: 36,
            color: 'var(--am)',
            letterSpacing: 6,
            animation: 'fl 1s ease-in-out infinite',
            textShadow: '0 0 20px rgba(255,191,0,0.4)',
          }}>
            MATCH FOUND
          </div>
        </div>
      )}
    </>
  );
}

export default LobbyScreen;
