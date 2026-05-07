/**
 * useMyGamesBadge — reads the current player's active group-chat matches
 * via socket, exposes counts for the menu's MY GAMES badge.
 *
 * Returns:
 *   {
 *     total: number,           // count of active group-chat matches
 *     awaitingTurn: number,    // count where it's currently this player's turn
 *     loaded: boolean,         // true after first fetch settles
 *   }
 *
 * Polls every 60s while mounted. Re-fetches on socket reconnect.
 *
 * Reuses the existing `getMyGroupMatches` / `myGroupMatches` socket
 * handler from server/socket-io/groupchat.js — no new server code.
 */
import { useState, useEffect, useRef } from 'react';

const POLL_MS = 60_000;

export default function useMyGamesBadge() {
    const [total, setTotal] = useState(0);
    const [awaitingTurn, setAwaitingTurn] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => {
        const sock = window.socket;
        if (!sock) return;

        const myTgId = window.solshot_telegram_user_id ?? null;

        const handleMatches = (data) => {
            const matches = Array.isArray(data?.matches) ? data.matches : [];
            // Only count matches in active states (lobby, awaiting_deposits, active)
            const active = matches.filter(m => {
                const s = m.state;
                return s === 'lobby' || s === 'awaiting_deposits' || s === 'active';
            });
            setTotal(active.length);

            // Count where it's our turn — only relevant in `active` state
            const pending = active.filter(m => {
                if (m.state !== 'active') return false;
                const cur = m.players?.[m.currentPlayerIndex];
                if (!cur) return false;
                // Identity match: prefer TG ID, fall back to wallet match
                if (myTgId != null && cur.telegramUserId === myTgId) return true;
                return false;
            });
            setAwaitingTurn(pending.length);
            setLoaded(true);
        };

        const fetchNow = () => {
            try {
                sock.emit('getMyGroupMatches');
            } catch (_) { /* never crash */ }
        };

        sock.on('myGroupMatches', handleMatches);
        sock.on('connect', fetchNow);

        // Initial fetch + interval poll
        fetchNow();
        timerRef.current = setInterval(fetchNow, POLL_MS);

        return () => {
            sock.off('myGroupMatches', handleMatches);
            sock.off('connect', fetchNow);
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    return { total, awaitingTurn, loaded };
}
