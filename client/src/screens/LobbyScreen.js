import React, { useState, useEffect, useCallback } from 'react';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import Modal from '../components/Modal';
import useSocket from '../hooks/useSocket';
import TANK_COLORS from '../data/colors';

/* ── wager tiers ── */
const WAGER_TIERS = [0, 0.01, 0.05, 0.1, 0.25, 0.5];

/* ── match-length options ── */
const MATCH_LENGTHS = [
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
    fontSize: 10,
    color: 'var(--am)',
    letterSpacing: 2,
    marginBottom: 2,
  },
  sublabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 8,
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
    padding: '6px 0',
    fontFamily: "'Black Ops One', cursive",
    fontSize: 11,
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
    padding: '4px 8px',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 9,
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
    width: 22,
    height: 22,
    borderRadius: 3,
    background: hex,
    border: selected ? '2px solid var(--bn)' : '2px solid transparent',
    cursor: 'pointer',
    transition: 'border 0.15s ease',
    boxShadow: selected ? `0 0 8px ${hex}` : 'none',
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
    fontSize: 10,
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
    width: 12,
    height: 12,
    borderRadius: 2,
    background: hex,
    flexShrink: 0,
  }),
  hostName: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    color: 'var(--bn)',
    letterSpacing: 1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  wagerBadge: (amount) => ({
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 9,
    letterSpacing: 1,
    padding: '2px 6px',
    borderRadius: 3,
    background: amount > 0 ? 'rgba(20, 241, 149, 0.08)' : 'rgba(184, 168, 138, 0.08)',
    border: amount > 0 ? '1px solid rgba(20, 241, 149, 0.3)' : '1px solid rgba(184, 168, 138, 0.15)',
    color: amount > 0 ? 'var(--sg)' : 'var(--kh)',
    flexShrink: 0,
  }),
  emptyState: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 9,
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
    fontSize: 14,
    color: 'var(--am)',
    letterSpacing: 3,
    animation: 'fl 2s ease-in-out infinite',
  },
  waitingSubtext: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 9,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.7,
  },
};


function LobbyScreen({ navigate }) {
  /* ── state ── */
  const [rooms, setRooms] = useState([]);
  const [matchLength, setMatchLength] = useState(1); // rounds: 1, 3, 5
  const [wager, setWager] = useState(0);
  const [selectedColor, setSelectedColor] = useState(0); // index into TANK_COLORS
  const [waiting, setWaiting] = useState(false); // waiting for opponent
  const [error, setError] = useState(null);

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

  /* ── socket: game starts ── */
  useSocket('startPick', (data) => {
    setWaiting(false);
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

  /* ── actions ── */
  const createRoom = useCallback(() => {
    if (!window.socket) return;

    const name = getPlayerName();
    const color = TANK_COLORS[selectedColor].phaserHex;

    window.socket.emit('createRoom', {
      player: {
        name,
        color,
        walletAddress: window.solWallet?.publicKey?.toString() || null,
        wager,
      },
    });

    setWaiting(true);
  }, [getPlayerName, selectedColor, wager]);

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

  const quickMatch = useCallback(() => {
    // Join first available free room, or create one
    const freeRoom = rooms.find((r) => r.wager === 0);
    if (freeRoom) {
      joinRoom(freeRoom.roomId);
    } else {
      // Set wager to 0 and create
      setWager(0);
      const name = getPlayerName();
      const color = TANK_COLORS[selectedColor].phaserHex;
      if (window.socket) {
        window.socket.emit('createRoom', {
          player: { name, color, walletAddress: window.solWallet?.publicKey?.toString() || null, wager: 0 },
        });
        setWaiting(true);
      }
    }
  }, [rooms, joinRoom, getPlayerName, selectedColor]);

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
        if (waiting) cancelRoom();
        navigate('menu');
      }} />

      <div style={s.container}>
        {/* ═══ LEFT PANEL ═══ */}
        <div style={s.left}>
          {/* Match Length */}
          <div>
            <div style={s.sectionLabel}>MATCH LENGTH</div>
            <div style={s.matchRow}>
              {MATCH_LENGTHS.map((m) => (
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
          <div>
            <div style={s.sectionLabel}>WAGER</div>
            <div style={s.sublabel}>SOL STAKE PER MATCH</div>
            <div style={s.wagerRow}>
              {WAGER_TIERS.map((tier) => (
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
            <Button variant="primary" onClick={quickMatch} style={{ fontSize: 11, padding: '10px 16px' }}>
              QUICK MATCH
            </Button>
            <Button variant="secondary" onClick={createRoom} style={{ fontSize: 10, padding: '8px 14px' }}>
              CREATE MATCH
            </Button>
            {wager > 0 && (
              <div style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 8,
                color: 'var(--sg)',
                letterSpacing: 1,
                textAlign: 'center',
                opacity: 0.8,
              }}>
                {'◆ ' + wager + ' SOL WAGER'}
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
              fontSize: 9,
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
              rooms.map((room) => (
                <div key={room.roomId} style={s.roomCard}>
                  <div style={s.roomInfo}>
                    <div style={s.hostColor(getColorHex(room.host?.color))} />
                    <span style={s.hostName}>
                      {room.host?.name || 'UNKNOWN'}
                    </span>
                  </div>

                  <div style={s.wagerBadge(room.wager || 0)}>
                    {formatWager(room.wager || 0)}
                  </div>

                  <Button
                    variant="secondary"
                    onClick={() => joinRoom(room.roomId)}
                    style={{ fontSize: 9, padding: '4px 12px', letterSpacing: 2 }}
                  >
                    JOIN
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ═══ WAITING OVERLAY ═══ */}
      {waiting && (
        <div style={s.waitingOverlay}>
          <div style={s.waitingText}>WAITING FOR OPPONENT</div>
          <div style={s.waitingSubtext}>
            {wager > 0 ? wager + ' SOL WAGER' : 'FREE MATCH'}
          </div>
          <Button
            variant="secondary"
            onClick={cancelRoom}
            style={{ fontSize: 10, padding: '8px 20px', marginTop: 8 }}
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
