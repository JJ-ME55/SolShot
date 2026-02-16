import { useState, useEffect, useRef } from 'react';

/**
 * useGameState — rAF-based poll of GameBridge with dirty flag.
 *
 * Only triggers React re-render when bridge.consume() returns non-null
 * (i.e., Phaser actually changed something). During idle turns, zero
 * re-renders occur. During projectile flight, only changed properties
 * trigger updates.
 */
function useGameState(bridge) {
  const [gameState, setGameState] = useState(bridge ? { ...bridge.state } : {});
  const rafRef = useRef(null);

  useEffect(() => {
    if (!bridge) return;

    const poll = () => {
      const updated = bridge.consume();
      if (updated) {
        setGameState(updated);
      }
      rafRef.current = requestAnimationFrame(poll);
    };

    rafRef.current = requestAnimationFrame(poll);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [bridge]);

  return gameState;
}

export default useGameState;
