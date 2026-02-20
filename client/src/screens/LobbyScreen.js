import React, { useState, useEffect, useCallback } from 'react';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import Modal from '../components/Modal';
import useSocket from '../hooks/useSocket';
import TANK_COLORS from '../data/colors';

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
  const [matchMode, setMatchMode] = useState('quick_match');
  const [matchLength, setMatchLength] = useState(1); // rounds: 1, 3, 5
  const [wager, setWager] = useState(0.1);
  const [customWager, setCustomWager] = useState(0.1); // for custom_challenge mode
  const [selectedColor, setSelectedColor] = useState(0); // index into TANK_COLORS
  const [waiting, setWaiting] = useState(false); // waiting for opponent (custom_challenge / createRoom)
  const [queueState, setQueueState] = useState(null); // null | 'searching' | 'matched'
  const [error, setError] = useState(null);

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

  /* ── derived player name from wallet ── */
  const getPlayerName = useCallback(() => {
    const wallet = window.solWallet;
    if (wallet && wallet.connected && wallet.publicKey) {
      const addr = wallet.publicKey.toString();
      return addr.slice(0, 4) + '...' + addr.slice(-4);
    }
    return 'SOLDIER';
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

  /* ── socket: escrow deposit (sign wager before match starts) ── */
  useSocket('escrowDeposit', async (data) => {
    if (!data?.transaction) return;
    const signFn = window.solWallet?.signAndSendEscrowDeposit;
    if (signFn) {
      const sig = await signFn(data.transaction, data.roomId);
      if (!sig) {
        setError('Failed to deposit wager. Try again or lower your wager.');
      }
    }
  });

  /* ── socket: game starts ── */
  useSocket('startPick', (data) => {
    setWaiting(false);
    setQueueState(null);
    navigate('shop', data);
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
    setWaiting(false);
    setError('Opponent has left the lobby');
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
    // Match found — server will also emit startPick which navigates to shop
    setQueueState('matched');
    setWaiting(false);
  });

  useSocket('queueError', (data) => {
    setQueueState(null);
    setError(data?.reason || 'Queue error');
  });

  useSocket('queueLeft', () => {
    setQueueState(null);
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
        walletAddress: window.solWallet?.publicKey?.toString() || null,
        wager: wagerToSend,
        matchLength,
        matchMode,
      },
    });

    setWaiting(true);
  }, [getPlayerName, selectedColor, wager, customWager, isCustomMode, matchLength, matchMode]);

  const joinRoom = useCallback((roomId) => {
    if (!window.socket) return;

    const name = getPlayerName();
    const color = TANK_COLORS[selectedColor].phaserHex;

    window.socket.emit('joinRoom', {
      roomId,
      name,
      color,
      walletAddress: window.solWallet?.publicKey?.toString() || null,
      wager,
    });
  }, [getPlayerName, selectedColor, wager]);

  const cancelRoom = useCallback(() => {
    if (!window.socket) return;
    window.socket.emit('deleteRoom');
    setWaiting(false);
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

  /* ── helpers ── */
  const getColorHex = (phaserColor) => {
    const found = TANK_COLORS.find((c) => c.phaserHex === phaserColor);
    return found ? found.hex : '#FFFFFF';
  };

  const formatWager = (amount) => {
    if (amount === 0) return 'FREE';
    return amount + ' SOL';
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
              {MODE_KEYS.map((key) => (
                <div
                  key={key}
                  style={s.modeBtn(matchMode === key, MATCH_MODES[key].color)}
                  onClick={() => setMatchMode(key)}
                >
                  {MATCH_MODES[key].label}
                </div>
              ))}
            </div>
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
                    onClick={() => setWager(tier)}
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
              {TANK_COLORS.map((c, i) => (
                <div
                  key={c.id}
                  style={s.colorSwatch(c.hex, selectedColor === i)}
                  onClick={() => setSelectedColor(i)}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={s.quickBtns}>
            {isCustomMode ? (
              <Button variant="primary" onClick={createRoom} style={{ fontSize: 15, padding: '12px 20px', borderColor: '#ff6600', color: '#ff6600' }}>
                CREATE CHALLENGE
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
                      {formatWager(room.wager || 0)}
                    </div>

                    <Button
                      variant="secondary"
                      onClick={() => joinRoom(room.roomId)}
                      style={{ fontSize: 13, padding: '6px 14px', letterSpacing: 2 }}
                    >
                      JOIN
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
          <div style={s.waitingText}>WAITING FOR OPPONENT</div>
          <div style={s.waitingSubtext}>
            {modeConfig.label + ' / BO' + matchLength + (effectiveWager > 0 ? ' / ' + effectiveWager + ' SOL' : '')}
          </div>
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
    </>
  );
}

export default LobbyScreen;
