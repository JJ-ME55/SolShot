import { useEffect, useRef } from 'react';

/**
 * useSocket — Subscribe to a socket.io event with stale-closure prevention.
 *
 * Uses a ref-based pattern so the callback always sees the latest React state,
 * even though the socket listener is only registered once.
 *
 * Usage:
 *   useSocket('setRooms', (data) => {
 *     setRooms(data.rooms); // always has fresh state
 *   });
 */
function useSocket(event, callback) {
  const savedCallback = useRef(callback);

  // Update ref on every render so callback always has fresh state
  useEffect(() => {
    savedCallback.current = callback;
  });

  useEffect(() => {
    if (!window.socket) return;

    const handler = (...args) => savedCallback.current(...args);
    window.socket.on(event, handler);
    return () => window.socket.off(event, handler);
  }, [event]);
}

export default useSocket;
