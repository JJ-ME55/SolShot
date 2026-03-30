import React, { useState, useEffect, useCallback, useRef } from 'react';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import Modal from '../components/Modal';
import useSocket from '../hooks/useSocket';
import TANK_COLORS from '../data/colors';
import { useSolShotWallet } from '../wallet/WalletContext';

/* ── match modes (mirrors server MATCH_MODES — Litepaper v2.1) ── */
const MATCH_MODES = {
  practice:         { label: 'PRACTICE',         wagerRange: [0, 0],          formats: [1],       color: 'var(--kh)' },
  quick_match:      { label: 'QUICK MATCH',       wagerRange: [0.1, 0.1],      formats: [1, 3],    color: 'var(--sg)' },
  duel:             { label: 'DUEL',              wagerRange: [0.25, 0.5],     formats: [3, 5],    color: '#00ccff' },
  high_roller:      { label: 'HIGH ROLLER',       wagerRange: [1.0, 1.0],      formats: [3, 5],    color: '#ffcc00' },
  custom_challenge: { label: 'CUSTOM CHALLENGE',  wagerRange: [0.1, Infinity], formats: [1, 3, 5], color: '#ff6600' },
};
const MODE_KEYS = Object.keys(MATCH_MODES);

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
    borderRadius: 3,
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
    borderRadius: 3,
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
    borderRadius: 3,
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
    borderRadius: 3,
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
    borderRadius: 4,
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
    borderRadius: 3,
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


function LobbyScreen({ navigate }) {
  /* ── state ── */
  const [rooms, setRooms] = useState([]);
  const [matchMode, setMatchMode] = useState('practice');
  const [matchLength, setMatchLength] = useState(1); // rounds: 1, 3, 5
  const [wager, setWager] = useState(0.1);
  const [customWager, setCustomWager] = useState(0.1); // for custom_challenge mode
  const [selectedColor, setSelectedColor] = useState(0); // index into TANK_COLORS
  const [waiting, setWaiting] = useState(false); // waiting for opponent (custom_challenge / createRoom)
  const [queueState, setQueueState] = useState(null); // null | 'searching' | 'matched'
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
  const countdownRef = useRef(null);

  // CS-04: Use context hook instead of window.solWallet
  const { signAndSendEscrowDeposit, walletAddress } = useSolShotWallet();

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
  const createRoom = useCallback(() => {
    if (!window.socket) return;

    const name = getPlayerName();
    const color = TANK_COLORS[selectedColor].phaserHex;
    const wagerToSend = isCustomMode ? customWager : wager;

    window.socket.emit('createRoom', {
      player: {
        name,
        color,
        walletAddress: walletAddress || null,
        wager: wagerToSend,
        matchLength,
        matchMode,
        maxPlayers: numPlayers,
      },
    });

    setWaitingRoomMax(numPlayers);
    setWaiting(true);
  }, [getPlayerName, selectedColor, wager, customWager, isCustomMode, matchLength, matchMode, walletAddress, numPlayers]);

  const joinRoom = useCallback((roomId) => {
    if (!window.socket) return;

    const name = getPlayerName();
    const color = TANK_COLORS[selectedColor].phaserHex;

    window.socket.emit('joinRoom', {
      roomId,
      name,
      color,
      walletAddress: walletAddress || null,
      wager,
    });
  }, [getPlayerName, selectedColor, wager, walletAddress]);

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
    const name = getPlayerName();
    const color = TANK_COLORS[selectedColor].phaserHex;
    const wagerToSend = isCustomMode ? customWager : wager;
    window.socket.emit('joinQueue', {
      matchMode,
      matchLength,
      wager: wagerToSend,
      playerName: name,
      tankColor: color,
    });
    setQueueState('searching');
  }, [getPlayerName, selectedColor, matchMode, matchLength, wager, customWager, isCustomMode]);

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
                const locked = key !== 'practice';
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

          {/* Player Count */}
          <div>
            <div style={s.sectionLabel}>PLAYERS</div>
            <div style={s.matchRow}>
              {[2, 3, 4].map((n) => (
                <div
                  key={n}
                  style={s.matchBtn(numPlayers === n)}
                  onClick={() => setNumPlayers(n)}
                >
                  {n + 'P'}
                </div>
              ))}
            </div>
          </div>

          {/* Wager */}
          {isCustomMode ? (
            <div>
              <div style={s.sectionLabel}>WAGER (SOL)</div>
              <div style={s.sublabel}>MINIMUM 0.1 SOL</div>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={customWager}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val >= 0.1) setCustomWager(Math.round(val * 100) / 100);
                }}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: 14,
                  letterSpacing: 1,
                  background: 'rgba(255, 102, 0, 0.08)',
                  border: '1px solid #ff6600',
                  borderRadius: 3,
                  color: '#ff6600',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
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

          {/* Color Picker */}
          <div>
            <div style={s.sectionLabel}>TANK COLOR</div>
            <div style={s.colorRow}>
              {TANK_COLORS.map((c, i) => {
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
                CREATE CHALLENGE
              </Button>
            ) : matchMode === 'practice' ? (
              <Button variant="primary" onClick={createRoom} style={{ fontSize: 15, padding: '12px 20px' }}>
                CREATE MATCH
              </Button>
            ) : (
              <Button variant="primary" onClick={joinQueue} style={{ fontSize: 15, padding: '12px 20px' }}>
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
                  borderRadius: 3,
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
              <div style={s.emptyState}>
                NO OPEN LOBBIES -- CREATE A MATCH
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
                  borderRadius: 3,
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
              borderRadius: 4,
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
