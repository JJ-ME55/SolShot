import React, { useState, useEffect, useCallback, useRef } from 'react';
import ScreenHeader from '../components/design/ScreenHeader';
import TerrainSilhouette from '../components/design/Terrain';
import Modal from '../components/Modal';
import useSocket from '../hooks/useSocket';
import TANK_COLORS from '../data/colors';
import { useSolShotWallet } from '../wallet/WalletContext';
import { useTelegram } from '../telegram/TelegramContext';

/* match modes (mirrors server MATCH_MODES — Litepaper v2.1) */
const MATCH_MODES = {
  practice:         { label: 'PRACTICE',         desc: 'FREE PRACTICE MODE',   wagerRange: [0, 0],          formats: [1],       color: 'var(--olive)' },
  quick_match:      { label: 'QUICK MATCH',      desc: 'AUTO-MATCH · WAGERED', wagerRange: [0.1, 0.1],      formats: [1, 3],    color: '#7fd060' },
  duel:             { label: 'DUEL',             desc: 'EXTENDED · WAGERED',   wagerRange: [0.25, 0.5],     formats: [3, 5],    color: '#4fc0b4' },
  high_roller:      { label: 'HIGH ROLLER',      desc: 'MAX STAKES · WAGERED', wagerRange: [1.0, 1.0],      formats: [3, 5],    color: '#e8c820' },
  custom_challenge: { label: 'CUSTOM',           desc: 'SET YOUR OWN TERMS',   wagerRange: [0.1, Infinity], formats: [1, 3, 5], color: 'var(--accent)' },
};
const MODE_KEYS = Object.keys(MATCH_MODES);
const ALL_WAGER_TIERS = [0, 0.1, 0.25, 0.5, 1.0];
const ALL_MATCH_LENGTHS = [{ label: 'BO1', rounds: 1 }, { label: 'BO3', rounds: 3 }, { label: 'BO5', rounds: 5 }];

const labelStyle = { fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.22em', marginBottom: 8, textTransform: 'uppercase' };
const pillBtn = (active, disabled = false) => ({
  flex: 1, padding: '10px',
  background: active ? 'var(--accent)' : 'var(--bg-surface)',
  color: active ? '#0e1209' : disabled ? 'var(--muted)' : 'var(--bone)',
  border: '1px solid ' + (active ? 'var(--accent-hot)' : 'var(--border)'),
  clipPath: 'var(--clip-6)',
  fontFamily: 'var(--f-display)', fontSize: 13, letterSpacing: '0.12em',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
});

function LobbyScreen({ navigate, screenData }) {
  const { isTelegram } = useTelegram();
  const [rooms, setRooms] = useState([]);
  const [matchMode, setMatchMode] = useState('practice');
  const [matchLength, setMatchLength] = useState(1);
  const [wager, setWager] = useState(0.1);
  const [customWager, setCustomWager] = useState(0.1);
  const [selectedColor, setSelectedColor] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [queueState, setQueueState] = useState(null);
  const [error, setError] = useState(null);
  const [showEscrow, setShowEscrow] = useState(false);
  const [matchFound, setMatchFound] = useState(false);
  const [numPlayers, setNumPlayers] = useState(2);
  const [waitingRoomPlayers, setWaitingRoomPlayers] = useState([]);
  const [waitingRoomMax, setWaitingRoomMax] = useState(2);
  const [depositStatuses, setDepositStatuses] = useState([]);
  const [depositCountdown, setDepositCountdown] = useState(null);
  const [isDecisionMaker, setIsDecisionMaker] = useState(false);
  const [partialDepositInfo, setPartialDepositInfo] = useState(null);
  const [kickedMessage, setKickedMessage] = useState(null);
  const [challengeCallsign, setChallengeCallsign] = useState('');
  const [challengeSentTo, setChallengeSentTo] = useState(null);
  const [incomingChallenge, setIncomingChallenge] = useState(null);
  const [confirmJoin, setConfirmJoin] = useState(null);
  // Phase 3 — Telegram challenge sharing
  const [challengeShortCode, setChallengeShortCode] = useState(null);
  const [challengeDeepLink, setChallengeDeepLink] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const challengeAutoFiredRef = useRef(false);
  const countdownRef = useRef(null);

  const { signAndSendEscrowDeposit, walletAddress } = useSolShotWallet();

  const modeConfig = MATCH_MODES[matchMode];
  const isCustomMode = matchMode === 'custom_challenge';
  const availableWagers = isCustomMode ? [] : ALL_WAGER_TIERS.filter(t => t >= modeConfig.wagerRange[0] && t <= modeConfig.wagerRange[1]);
  const availableFormats = ALL_MATCH_LENGTHS.filter(m => modeConfig.formats.includes(m.rounds));
  const effectiveWager = isCustomMode ? customWager : wager;

  useEffect(() => {
    const cfg = MATCH_MODES[matchMode];
    const validWagers = ALL_WAGER_TIERS.filter(t => t >= cfg.wagerRange[0] && t <= cfg.wagerRange[1]);
    if (!validWagers.includes(wager)) setWager(validWagers[0] ?? 0);
    if (!cfg.formats.includes(matchLength)) setMatchLength(cfg.formats[0]);
  }, [matchMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const getPlayerName = useCallback(() => {
    const handle = localStorage.getItem('solshot_handle');
    if (handle) return handle;
    if (walletAddress) return walletAddress.slice(0, 4) + '...' + walletAddress.slice(-4);
    return 'SOLDIER';
  }, [walletAddress]);

  const clearDepositState = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setDepositCountdown(null);
    setDepositStatuses([]);
    setIsDecisionMaker(false);
    setPartialDepositInfo(null);
  }, []);

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  useEffect(() => { if (window.socket) window.socket.emit('getRooms'); }, []);

  // Phase 3 — auto-fire challenge create when arriving via /challenge bot command
  useEffect(() => {
    if (!screenData?.autoCreateChallenge) return;
    if (challengeAutoFiredRef.current) return;
    challengeAutoFiredRef.current = true;
    const sock = window.socket;
    if (!sock) return;
    const handle = localStorage.getItem('solshot_handle') || 'OPERATIVE';
    const fire = () => {
      sock.emit('createChallengeRoom', {
        player: { name: handle, color: 0, wager: 0 },
        format: 'BO1',
        wagerToken: 'SOL',
      });
      setWaiting(true);
    };
    if (sock.connected) fire();
    else sock.once('connect', fire);
  }, [screenData]);

  useSocket('setRooms', (data) => { if (data?.rooms) setRooms(data.rooms); });
  useSocket('roomUpdate', (data) => {
    if (data?.players) {
      setWaitingRoomPlayers(data.players);
      setWaitingRoomMax(data.maxPlayers || 2);
      if (data.roomId) setCurrentRoomId(data.roomId);
    }
  });

  // Phase 3 — challenge created (from /challenge flow): show share UI
  useSocket('challengeCreated', (data) => {
    if (!data) return;
    setChallengeShortCode(data.shortCode);
    setChallengeDeepLink(data.deepLink);
    if (data.roomId) setCurrentRoomId(data.roomId);
  });
  useSocket('challengeCreateError', (data) => {
    setError(data?.reason || 'Could not create challenge');
  });

  useSocket('escrowDeposit', async (data) => {
    if (!data?.transaction) return;
    if (signAndSendEscrowDeposit) {
      const sig = await signAndSendEscrowDeposit(data.transaction, data.roomId);
      if (!sig) setError('Failed to deposit wager. Try again or lower your wager.');
    }
    if (data.depositDeadlineMs) {
      if (countdownRef.current) clearInterval(countdownRef.current);
      const tick = () => {
        const rem = Math.max(0, Math.ceil((data.depositDeadlineMs - Date.now()) / 1000));
        setDepositCountdown(rem);
        if (rem <= 0) { clearInterval(countdownRef.current); countdownRef.current = null; }
      };
      tick();
      countdownRef.current = setInterval(tick, 1000);
    }
  });
  useSocket('escrowDepositStatus', (data) => setDepositStatuses(data?.deposits || []));
  useSocket('escrowPartialDeposit', (data) => {
    setIsDecisionMaker(true);
    setPartialDepositInfo({ numDeposited: data.numDeposited, totalPlayers: data.totalPlayers, canStart: data.canStart });
    if (countdownRef.current) clearInterval(countdownRef.current);
    const decisionDeadline = Date.now() + (data.decisionWindowMs || 30000);
    const tick = () => {
      const rem = Math.max(0, Math.ceil((decisionDeadline - Date.now()) / 1000));
      setDepositCountdown(rem);
      if (rem <= 0) { clearInterval(countdownRef.current); countdownRef.current = null; }
    };
    tick();
    countdownRef.current = setInterval(tick, 1000);
  });
  useSocket('escrowPartialWaiting', (data) => {
    setPartialDepositInfo({ numDeposited: data.numDeposited, totalPlayers: data.totalPlayers, canStart: false, waitingForDecision: true });
    if (countdownRef.current) clearInterval(countdownRef.current);
    setDepositCountdown(null);
  });
  useSocket('escrowActive', () => clearDepositState());
  useSocket('escrowCancelledAll', () => { clearDepositState(); setWaiting(false); setError('Match cancelled -- all deposits refunded.'); });
  useSocket('escrowDepositTimeout', () => { clearDepositState(); setWaiting(false); setError('Deposit window expired -- match cancelled.'); });
  useSocket('kickedFromRoom', (data) => { clearDepositState(); setWaiting(false); setKickedMessage(data?.reason || 'You were removed from the match.'); });

  useSocket('startPick', (data) => {
    clearDepositState();
    setWaiting(false);
    setQueueState(null);
    setWaitingRoomPlayers([]);
    setMatchFound(true);
    setTimeout(() => { setMatchFound(false); navigate('shop', data); }, 800);
  });
  useSocket('joinRoomError', (data) => setError(data?.reason || 'Failed to join room'));
  useSocket('createRoomError', (data) => { setWaiting(false); setError(data?.reason || 'Failed to create room'); });
  useSocket('opponentLeft', () => {
    clearDepositState();
    setWaiting(false);
    setWaitingRoomPlayers([]);
    setError('A player has left the lobby');
    if (window.socket) window.socket.emit('getRooms');
  });
  useSocket('queueWaiting', () => setQueueState('searching'));
  useSocket('queueMatched', () => { setQueueState('matched'); setWaiting(true); });
  useSocket('queueError', (data) => { setQueueState(null); setError(data?.reason || 'Queue error'); });
  useSocket('queueLeft', () => setQueueState(null));

  useSocket('challengeSent', (data) => setChallengeSentTo(data?.callsign || null));
  useSocket('challengeError', (data) => { setChallengeSentTo(null); setError(data?.reason || 'Challenge failed'); });
  useSocket('challengeReceived', (data) => setIncomingChallenge({ fromSocketId: data.fromSocketId, fromCallsign: data.fromCallsign }));
  useSocket('challengeAccepted', () => {
    setChallengeSentTo(null);
    if (!window.socket) return;
    const handle = localStorage.getItem('solshot_handle');
    const name = handle || (walletAddress ? walletAddress.slice(0, 4) + '...' + walletAddress.slice(-4) : 'SOLDIER');
    const color = TANK_COLORS[selectedColor].phaserHex;
    window.socket.emit('createRoom', {
      player: { name, color, walletAddress: walletAddress || null, wager: 0, matchLength: 1, matchMode: 'practice', maxPlayers: 2 },
    });
    setWaiting(true);
  });
  useSocket('challengeDeclined', (data) => { setChallengeSentTo(null); setError((data?.byCallsign || 'Player') + ' declined your challenge'); });

  useEffect(() => () => { if (window.socket) window.socket.emit('leaveQueue'); }, []);

  const createRoom = useCallback(() => {
    if (!window.socket) return;
    const name = getPlayerName();
    const color = TANK_COLORS[selectedColor].phaserHex;
    const wagerToSend = isCustomMode ? customWager : wager;
    window.socket.emit('createRoom', {
      player: { name, color, walletAddress: walletAddress || null, wager: wagerToSend, matchLength, matchMode, maxPlayers: numPlayers },
    });
    setWaitingRoomMax(numPlayers);
    setWaiting(true);
  }, [getPlayerName, selectedColor, wager, customWager, isCustomMode, matchLength, matchMode, walletAddress, numPlayers]);

  const joinRoom = useCallback((roomId) => {
    if (!window.socket) return;
    const name = getPlayerName();
    const color = TANK_COLORS[selectedColor].phaserHex;
    window.socket.emit('joinRoom', { roomId, name, color, walletAddress: walletAddress || null, wager });
  }, [getPlayerName, selectedColor, wager, walletAddress]);

  useEffect(() => {
    const roomId = screenData?.autoJoinRoomId;
    if (!roomId || !window.socket?.connected) return;
    joinRoom(roomId);
  }, [screenData?.autoJoinRoomId, joinRoom]);

  const cancelRoom = useCallback(() => {
    if (!window.socket) return;
    window.socket.emit('deleteRoom');
    setWaiting(false);
    setWaitingRoomPlayers([]);
    setTimeout(() => { if (window.socket) window.socket.emit('getRooms'); }, 200);
  }, []);

  const joinQueue = useCallback(() => {
    if (!window.socket) return;
    const name = getPlayerName();
    const color = TANK_COLORS[selectedColor].phaserHex;
    // Practice mode is always free (wager=0) — ignore the wager slider
    const wagerToSend = (matchMode === 'practice') ? 0 : (isCustomMode ? customWager : wager);
    window.socket.emit('joinQueue', { matchMode, matchLength, wager: wagerToSend, playerName: name, tankColor: color });
    setQueueState('searching');
  }, [getPlayerName, selectedColor, matchMode, matchLength, wager, customWager, isCustomMode]);

  const cancelQueue = useCallback(() => {
    if (!window.socket) return;
    window.socket.emit('leaveQueue');
    setQueueState(null);
  }, []);

  const handlePartialStart = useCallback(() => { if (window.socket) window.socket.emit('escrowPartialStart'); }, []);
  const handleCancelAll = useCallback(() => { if (window.socket) window.socket.emit('escrowCancelAll'); }, []);

  const getColorHex = (phaserColor) => {
    const found = TANK_COLORS.find(c => c.phaserHex === phaserColor);
    return found ? found.hex : '#FFFFFF';
  };

  const claimedColors = waitingRoomPlayers
    .filter(p => p.socketId !== (window.socket && window.socket.id))
    .map(p => p.color);

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: 'var(--bg-deep)', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.05,
        backgroundImage: 'linear-gradient(to right, var(--olive) 1px, transparent 1px), linear-gradient(to bottom, var(--olive) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 24px 80px', position: 'relative', zIndex: 3 }}>
        <ScreenHeader
          title="DEPLOY"
          subtitle="CHOOSE MODE · SET TERMS · FIND OR CREATE A MATCH"
          onBack={() => {
            if (queueState === 'searching') cancelQueue();
            if (waiting) cancelRoom();
            navigate('menu');
          }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 18 }}>
          {/* LEFT: CONFIG */}
          <div>
            {/* MODE */}
            <div style={labelStyle}>MODE</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 6 }}>
              {MODE_KEYS.map(key => {
                const m = MATCH_MODES[key];
                const locked = key !== 'practice';
                const active = matchMode === key;
                return (
                  <button key={key} onClick={locked ? undefined : () => setMatchMode(key)} disabled={locked} style={{
                    background: active ? 'var(--bg-raised)' : 'var(--bg-surface)',
                    color: active ? m.color : locked ? 'var(--muted)' : 'var(--bone)',
                    border: '1px solid ' + (active ? m.color : 'var(--border)'),
                    clipPath: 'var(--clip-6)',
                    padding: '10px 6px',
                    cursor: locked ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--f-display)', fontSize: 10, letterSpacing: '0.08em',
                    position: 'relative', opacity: locked ? 0.55 : 1,
                    lineHeight: 1.15, minHeight: 46,
                  }}>
                    {m.label}
                    {locked && (
                      <div style={{
                        position: 'absolute', top: -4, right: -4,
                        background: 'var(--muted)', color: 'var(--bg-deep)',
                        fontFamily: 'var(--f-mono)', fontSize: 7,
                        padding: '1px 4px', letterSpacing: '0.15em',
                      }}>SOON</div>
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: modeConfig.color, letterSpacing: '0.22em', marginBottom: 14 }}>
              {modeConfig.desc}
            </div>

            {/* FORMAT */}
            <div style={labelStyle}>FORMAT</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
              {availableFormats.map(m => (
                <button key={m.rounds} onClick={() => setMatchLength(m.rounds)} style={pillBtn(matchLength === m.rounds)}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* PLAYERS */}
            <div style={labelStyle}>PLAYERS</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
              {[2, 3, 4].map(n => (
                <button key={n} onClick={() => setNumPlayers(n)} style={pillBtn(numPlayers === n)}>
                  {n}P
                </button>
              ))}
            </div>

            {/* WAGER */}
            {isCustomMode ? (
              <>
                <div style={labelStyle}>WAGER (SOL)</div>
                <input
                  type="number" min="0.1" step="0.1" value={customWager}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0.1) setCustomWager(Math.round(val * 100) / 100);
                  }}
                  style={{
                    width: '100%', padding: '10px 12px',
                    fontFamily: 'var(--f-mono)', fontSize: 13, letterSpacing: '0.15em',
                    background: 'rgba(200,120,26,0.08)', border: '1px solid var(--accent)',
                    color: 'var(--accent)', outline: 'none', clipPath: 'var(--clip-6)',
                    boxSizing: 'border-box', marginBottom: 14,
                  }}
                />
              </>
            ) : availableWagers.length > 1 ? (
              <>
                <div style={labelStyle}>WAGER</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
                  {availableWagers.map(tier => (
                    <button key={tier} onClick={() => {
                      setWager(tier);
                      if (tier > 0 && !localStorage.getItem('solshot_escrow_seen')) setShowEscrow(true);
                    }} style={{
                      padding: '6px 12px', background: wager === tier ? 'rgba(200,120,26,0.12)' : 'var(--bg-surface)',
                      color: wager === tier ? 'var(--accent)' : 'var(--bone)',
                      border: '1px solid ' + (wager === tier ? 'var(--accent)' : 'var(--border)'),
                      fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '0.15em',
                      clipPath: 'var(--clip-6)', cursor: 'pointer',
                    }}>{tier === 0 ? 'FREE' : tier + ' SOL'}</button>
                  ))}
                </div>
              </>
            ) : null}

            {/* TANK COLOR */}
            <div style={labelStyle}>TANK COLOR</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 18 }}>
              {TANK_COLORS.map((c, i) => {
                const isClaimed = claimedColors.includes(c.phaserHex);
                return (
                  <button key={c.id}
                    onClick={() => !isClaimed && setSelectedColor(i)}
                    title={isClaimed ? c.name + ' (taken)' : c.name}
                    style={{
                      width: 28, height: 28, background: c.hex,
                      border: '2px solid ' + (selectedColor === i ? 'var(--bone)' : 'var(--border)'),
                      clipPath: 'var(--clip-6)',
                      cursor: isClaimed ? 'not-allowed' : 'pointer',
                      opacity: isClaimed ? 0.25 : 1, padding: 0,
                    }} />
                );
              })}
            </div>

            {/* PRIMARY ACTION */}
            <button
              onClick={isCustomMode ? createRoom : joinQueue}
              style={{
                width: '100%', padding: 16, background: 'var(--accent)', color: '#0e1209',
                border: '1px solid var(--accent-hot)', clipPath: 'var(--clip-10)',
                fontFamily: 'var(--f-display)', fontSize: 15, letterSpacing: '0.18em',
                cursor: 'pointer', marginBottom: 6,
                boxShadow: '0 0 18px rgba(218,138,40,0.22)',
              }}>
              {isCustomMode ? 'CREATE CHALLENGE' : matchMode === 'practice' ? 'FIND OPPONENT' : 'FIND ' + modeConfig.label}
            </button>
            <div style={{
              fontFamily: 'var(--f-mono)', fontSize: 9,
              color: effectiveWager > 0 ? modeConfig.color : 'var(--muted)',
              textAlign: 'center', letterSpacing: '0.22em', marginBottom: 20,
            }}>
              ◆ {effectiveWager > 0 ? effectiveWager + ' SOL WAGER' : 'FREE MATCH'}
            </div>

            {/* CHALLENGE BY CALLSIGN */}
            <div style={labelStyle}>CHALLENGE PLAYER</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="text" placeholder="ENTER CALLSIGN" value={challengeCallsign}
                onChange={(e) => setChallengeCallsign(e.target.value.toUpperCase().slice(0, 16))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && challengeCallsign.trim()) {
                    window.socket?.emit('challengeCallsign', { callsign: challengeCallsign.trim() });
                  }
                }}
                style={{
                  flex: 1, padding: '10px 12px',
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  color: 'var(--bone)', fontFamily: 'var(--f-mono)', fontSize: 11,
                  letterSpacing: '0.15em', outline: 'none', clipPath: 'var(--clip-6)',
                  boxSizing: 'border-box', textTransform: 'uppercase',
                }}
              />
              <button
                onClick={() => { if (challengeCallsign.trim()) window.socket?.emit('challengeCallsign', { callsign: challengeCallsign.trim() }); }}
                style={{
                  background: 'var(--bg-raised)', color: 'var(--bone)',
                  border: '1px solid var(--border)', padding: '0 16px',
                  fontFamily: 'var(--f-display)', fontSize: 12, letterSpacing: '0.15em',
                  cursor: 'pointer', clipPath: 'var(--clip-6)',
                }}>SEND</button>
            </div>
            {challengeSentTo && (
              <div style={{
                fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--accent)',
                letterSpacing: '0.2em', marginTop: 6,
              }}>
                CHALLENGE SENT TO {challengeSentTo}…
              </div>
            )}
          </div>

          {/* RIGHT: OPEN LOBBIES */}
          <div>
            <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span>OPEN LOBBIES</span>
              {rooms.length > 0 && (
                <span style={{ color: 'var(--olive)', fontSize: 9 }}>{rooms.length} ACTIVE</span>
              )}
            </div>

            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              clipPath: 'var(--clip-10)', minHeight: 560, padding: rooms.length === 0 ? '40px 20px' : 0,
              display: 'flex', flexDirection: rooms.length === 0 ? 'column' : 'column',
              alignItems: rooms.length === 0 ? 'center' : 'stretch',
              justifyContent: rooms.length === 0 ? 'center' : 'flex-start',
              gap: rooms.length === 0 ? 14 : 0,
              textAlign: rooms.length === 0 ? 'center' : 'left',
            }}>
              {rooms.length === 0 ? (
                <>
                  <svg width="72" height="72" viewBox="0 0 72 72" style={{ opacity: 0.6 }}>
                    <rect x="8" y="24" width="56" height="32" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="4 4" />
                    <path d="M8,24 L36,10 L64,24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="4 4" />
                    <circle cx="36" cy="40" r="8" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
                    <line x1="36" y1="30" x2="36" y2="36" stroke="var(--accent)" strokeWidth="1.5" />
                    <line x1="36" y1="44" x2="36" y2="50" stroke="var(--accent)" strokeWidth="1.5" />
                    <line x1="26" y1="40" x2="32" y2="40" stroke="var(--accent)" strokeWidth="1.5" />
                    <line x1="40" y1="40" x2="46" y2="40" stroke="var(--accent)" strokeWidth="1.5" />
                  </svg>
                  <div style={{ fontFamily: 'var(--f-display)', fontSize: 18, color: 'var(--bone)', letterSpacing: '0.22em' }}>
                    NO OPEN LOBBIES
                  </div>
                  <div style={{
                    fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--olive)',
                    letterSpacing: '0.2em', maxWidth: 320, lineHeight: 1.6,
                  }}>
                    BE FIRST INTO THE FIELD. CONFIGURE MODE AT LEFT AND CREATE A MATCH.
                  </div>
                </>
              ) : (
                rooms.map((room, i) => {
                  const rMode = room.matchMode && MATCH_MODES[room.matchMode] ? MATCH_MODES[room.matchMode] : null;
                  const cur = room.currentPlayers || 1;
                  const max = room.maxPlayers || 2;
                  return (
                    <div key={room.roomId} style={{
                      display: 'grid', gridTemplateColumns: '16px 1fr auto auto auto auto', gap: 10,
                      alignItems: 'center', padding: '14px 18px',
                      borderBottom: i < rooms.length - 1 ? '1px dashed var(--muted)' : 'none',
                    }}>
                      <div style={{ width: 14, height: 14, background: getColorHex(room.host?.color), clipPath: 'var(--clip-6)' }} />
                      <div>
                        <div style={{ fontFamily: 'var(--f-sec)', color: 'var(--bone)', fontSize: 14, letterSpacing: '0.08em' }}>
                          {room.host?.name || 'UNKNOWN'}
                        </div>
                        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--olive)', letterSpacing: '0.2em', marginTop: 2 }}>
                          {cur}/{max} · BO{room.totalRounds || 1}
                        </div>
                      </div>
                      {rMode && (
                        <div style={{
                          fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.18em',
                          padding: '3px 7px', color: rMode.color, border: `1px solid ${rMode.color}33`,
                        }}>{rMode.label}</div>
                      )}
                      <div style={{
                        fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.18em',
                        padding: '3px 7px', color: 'var(--olive)', border: '1px solid var(--border)',
                      }}>BO{room.totalRounds || 1}</div>
                      <div style={{
                        fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.15em',
                        color: (room.wager || 0) > 0 ? '#7fd060' : 'var(--muted)',
                      }}>
                        {(room.wager || 0) === 0 ? 'FREE' : (room.wager * max).toFixed(2) + ' SOL'}
                      </div>
                      <button
                        onClick={() => setConfirmJoin({
                          roomId: room.roomId,
                          hostName: room.host?.name || 'UNKNOWN',
                          mode: rMode?.label || 'MATCH',
                          format: 'BO' + (room.totalRounds || 1),
                        })}
                        style={{
                          background: 'var(--accent)', color: '#0e1209',
                          border: '1px solid var(--accent-hot)', clipPath: 'var(--clip-6)',
                          padding: '8px 14px', fontFamily: 'var(--f-display)', fontSize: 12,
                          letterSpacing: '0.15em', cursor: 'pointer',
                        }}>JOIN</button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <TerrainSilhouette />

      {/* WAITING OVERLAY */}
      {waiting && (
        <WaitingOverlay
          waitingRoomPlayers={waitingRoomPlayers}
          waitingRoomMax={waitingRoomMax}
          modeLabel={modeConfig.label}
          matchLength={matchLength}
          effectiveWager={effectiveWager}
          depositStatuses={depositStatuses}
          getColorHex={getColorHex}
          isTelegram={isTelegram}
          currentRoomId={currentRoomId}
          depositCountdown={depositCountdown}
          partialDepositInfo={partialDepositInfo}
          isDecisionMaker={isDecisionMaker}
          onPartialStart={handlePartialStart}
          onCancelAll={handleCancelAll}
          onCancel={cancelRoom}
        />
      )}

      {/* QUEUE SEARCHING */}
      {queueState === 'searching' && (
        <div style={overlayStyle}>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, color: 'var(--accent)', letterSpacing: '0.2em' }}>
            SEARCHING FOR OPPONENT…
          </div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--olive)', letterSpacing: '0.2em' }}>
            {modeConfig.label} / BO{matchLength} / {effectiveWager > 0 ? effectiveWager + ' SOL' : 'FREE'}
          </div>
          <button onClick={cancelQueue} style={cancelBtnStyle}>CANCEL</button>
        </div>
      )}

      {error && (
        <Modal title="ERROR" message={error} buttons={[{ label: 'DISMISS', variant: 'secondary', onClick: () => setError(null) }]} onClose={() => setError(null)} />
      )}
      {showEscrow && (
        <Modal
          title="HOW WAGERING WORKS"
          message="Your SOL is held by a smart contract (escrow) during the match. The winner receives 90% of the pot. Neither player nor SolShot can access funds during the match. If your opponent disconnects, you get a full refund."
          buttons={[{ label: 'GOT IT', variant: 'primary', onClick: () => { localStorage.setItem('solshot_escrow_seen', 'true'); setShowEscrow(false); } }]}
          onClose={() => { localStorage.setItem('solshot_escrow_seen', 'true'); setShowEscrow(false); }}
        />
      )}
      {kickedMessage && (
        <Modal title="REMOVED FROM MATCH" message={kickedMessage}
          buttons={[{ label: 'RETURN TO MENU', variant: 'secondary', onClick: () => { setKickedMessage(null); navigate('menu'); } }]}
          onClose={() => { setKickedMessage(null); navigate('menu'); }} />
      )}
      {incomingChallenge && (
        <Modal
          title="INCOMING CHALLENGE"
          message={incomingChallenge.fromCallsign + ' wants to battle you!'}
          buttons={[
            { label: 'ACCEPT', variant: 'primary', onClick: () => { window.socket?.emit('acceptChallenge', { fromSocketId: incomingChallenge.fromSocketId }); setIncomingChallenge(null); } },
            { label: 'DECLINE', variant: 'secondary', onClick: () => { window.socket?.emit('declineChallenge', { fromSocketId: incomingChallenge.fromSocketId }); setIncomingChallenge(null); } },
          ]}
          onClose={() => { window.socket?.emit('declineChallenge', { fromSocketId: incomingChallenge.fromSocketId }); setIncomingChallenge(null); }}
        />
      )}
      {confirmJoin && (
        <Modal
          title="JOIN MATCH?"
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
          position: 'fixed', inset: 0, background: 'rgba(10, 12, 8, 0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}>
          <div style={{
            fontFamily: 'var(--f-display)', fontSize: 42, color: 'var(--accent)',
            letterSpacing: '0.22em', textShadow: '0 0 24px rgba(218,138,40,0.45)',
          }}>MATCH FOUND</div>
        </div>
      )}
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', inset: 0, zIndex: 30,
  background: 'rgba(10, 12, 8, 0.92)',
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 14,
};

const cancelBtnStyle = {
  background: 'transparent', color: 'var(--bone)',
  border: '1px solid var(--border)', padding: '10px 24px',
  fontFamily: 'var(--f-display)', fontSize: 13, letterSpacing: '0.18em',
  clipPath: 'var(--clip-6)', cursor: 'pointer', marginTop: 10,
};

function WaitingOverlay({
  waitingRoomPlayers, waitingRoomMax, modeLabel, matchLength, effectiveWager,
  depositStatuses, getColorHex, isTelegram, currentRoomId,
  depositCountdown, partialDepositInfo, isDecisionMaker,
  onPartialStart, onCancelAll, onCancel,
}) {
  return (
    <div style={overlayStyle}>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 24, color: 'var(--accent)', letterSpacing: '0.22em' }}>
        {waitingRoomPlayers.length >= waitingRoomMax ? `${waitingRoomPlayers.length}/${waitingRoomMax} PLAYERS` : 'AWAITING OPPONENT…'}
      </div>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--olive)', letterSpacing: '0.2em' }}>
        {modeLabel} / BO{matchLength}{effectiveWager > 0 ? ' / ' + effectiveWager + ' SOL' : ''}
        {depositStatuses.length > 0 && effectiveWager > 0 && ` — ${depositStatuses.filter(d => d.confirmed).length}/${depositStatuses.length} DEPOSITED`}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 320, marginTop: 8 }}>
        {Array.from({ length: waitingRoomMax }).map((_, i) => {
          const p = waitingRoomPlayers[i];
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px',
              background: p ? 'var(--bg-raised)' : 'transparent',
              border: p ? '1px solid var(--border)' : '1px dashed var(--muted)',
              clipPath: 'var(--clip-6)',
            }}>
              {p ? (
                <>
                  <div style={{ width: 12, height: 12, background: getColorHex(p.color), clipPath: 'var(--clip-6)' }} />
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--bone)', letterSpacing: '0.1em', flex: 1 }}>
                    {(p.isHost ? '[HOST] ' : '') + (p.name || 'UNKNOWN')}
                  </span>
                  {p.socketId === (window.socket && window.socket.id) && (
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: '#7fd060', letterSpacing: '0.22em' }}>YOU</span>
                  )}
                  {depositStatuses.length > 0 && (() => {
                    const ds = depositStatuses.find(d => d.socketId === p.socketId);
                    if (!ds) return null;
                    return (
                      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.2em', color: ds.confirmed ? '#7fd060' : 'var(--accent)' }}>
                        {ds.confirmed ? 'DEPOSITED' : 'PENDING…'}
                      </span>
                    );
                  })()}
                </>
              ) : (
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: '0.22em' }}>— WAITING —</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Challenge share panel — shown when a Phase 3 challenge has been created */}
      {challengeShortCode && challengeDeepLink && waitingRoomPlayers.length < waitingRoomMax && (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--accent)',
          padding: '14px 16px', marginTop: 12, marginBottom: 12,
          clipPath: 'var(--clip-10)',
          maxWidth: 480, marginLeft: 'auto', marginRight: 'auto',
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
            {isTelegram ? (
              <button
                onClick={() => {
                  const tg = window.Telegram?.WebApp;
                  if (tg?.switchInlineQuery) {
                    tg.switchInlineQuery('ch_' + challengeShortCode, ['users', 'groups']);
                  } else {
                    const shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(challengeDeepLink)
                      + '&text=' + encodeURIComponent('Accept my SolShot challenge');
                    tg?.openTelegramLink ? tg.openTelegramLink(shareUrl) : window.open(shareUrl, '_blank');
                  }
                }}
                style={{
                  padding: '10px', background: 'var(--accent)', color: '#0e1209',
                  border: '1px solid var(--accent-hot)', clipPath: 'var(--clip-6)',
                  fontFamily: 'var(--f-display)', fontSize: 11, letterSpacing: '0.18em',
                  cursor: 'pointer', boxShadow: '0 0 12px rgba(218,138,40,0.25)',
                }}>SEND CARD</button>
            ) : (
              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({ title: 'SolShot Challenge', url: challengeDeepLink }).catch(() => {});
                  } else {
                    window.open('https://t.me/share/url?url=' + encodeURIComponent(challengeDeepLink), '_blank');
                  }
                }}
                style={{
                  padding: '10px', background: 'var(--accent)', color: '#0e1209',
                  border: '1px solid var(--accent-hot)', clipPath: 'var(--clip-6)',
                  fontFamily: 'var(--f-display)', fontSize: 11, letterSpacing: '0.18em',
                  cursor: 'pointer',
                }}>SHARE</button>
            )}
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

      {/* Legacy invite button — only shows for normal (non-challenge) rooms */}
      {isTelegram && currentRoomId && !challengeShortCode && waitingRoomPlayers.length < waitingRoomMax && (
        <button
          onClick={() => {
            const inviteUrl = 'https://t.me/SolShotGG_bot/solshot?startapp=join_' + currentRoomId;
            const tg = window.Telegram?.WebApp;
            const shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(inviteUrl) + '&text=' + encodeURIComponent('Join my SolShot match!');
            if (tg?.openTelegramLink) tg.openTelegramLink(shareUrl);
            else window.open(shareUrl, '_blank');
          }}
          style={{
            background: 'transparent', color: '#0088cc', border: '1px solid #0088cc',
            padding: '8px 16px', fontFamily: 'var(--f-mono)', fontSize: 11,
            letterSpacing: '0.22em', clipPath: 'var(--clip-6)', cursor: 'pointer',
          }}>INVITE VIA TELEGRAM</button>
      )}

      {depositCountdown !== null && (
        <div style={{
          fontFamily: 'var(--f-mono)', fontSize: depositCountdown <= 30 ? 18 : 14,
          color: depositCountdown <= 30 ? '#c86060' : 'var(--olive)', letterSpacing: '0.22em',
        }}>
          {Math.floor(depositCountdown / 60)}:{String(depositCountdown % 60).padStart(2, '0')} {partialDepositInfo ? 'DECISION TIME' : 'DEPOSIT WINDOW'}
        </div>
      )}

      {partialDepositInfo && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          padding: '14px 18px', background: 'var(--bg-raised)',
          border: '1px solid var(--border)', clipPath: 'var(--clip-6)', width: 320,
        }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--accent)', letterSpacing: '0.2em' }}>
            {partialDepositInfo.numDeposited}/{partialDepositInfo.totalPlayers} DEPOSITED
          </div>
          {isDecisionMaker ? (
            <div style={{ display: 'flex', gap: 8 }}>
              {partialDepositInfo.canStart && (
                <button onClick={onPartialStart} style={{
                  background: 'var(--accent)', color: '#0e1209', border: '1px solid var(--accent-hot)',
                  padding: '8px 16px', fontFamily: 'var(--f-display)', fontSize: 12,
                  letterSpacing: '0.18em', clipPath: 'var(--clip-6)', cursor: 'pointer',
                }}>START WITH {partialDepositInfo.numDeposited}</button>
              )}
              <button onClick={onCancelAll} style={{
                background: 'transparent', color: 'var(--bone)', border: '1px solid var(--border)',
                padding: '8px 16px', fontFamily: 'var(--f-display)', fontSize: 12,
                letterSpacing: '0.18em', clipPath: 'var(--clip-6)', cursor: 'pointer',
              }}>CANCEL · REFUND</button>
            </div>
          ) : partialDepositInfo.waitingForDecision ? (
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--olive)', letterSpacing: '0.22em' }}>
              WAITING FOR HOST DECISION…
            </div>
          ) : null}
        </div>
      )}

      <button onClick={onCancel} style={cancelBtnStyle}>CANCEL</button>
    </div>
  );
}

export default LobbyScreen;
