import { useEffect } from 'react';

/**
 * useArcadeTokenReceiver — reads `?arcade_token=<jwt>` from the URL on
 * first load, validates it against the server, stores the resulting
 * identity hints in localStorage for the welcome banner, then strips
 * the param from the URL.
 *
 * The token is a *hint* (callsign for the welcome banner). It is NOT
 * authorisation — SolShot's real session still goes through Privy.
 * If the user isn't already signed in via Privy on solshot.gg, the
 * normal sign-in flow runs. Privy's native cross-origin session
 * sharing across the shared appId means most users won't see a
 * re-prompt anyway; this hook just gives the SolShot UI an early
 * signal that the user came from arcade.xyz.
 *
 * Pure side-effect — runs once on mount, no return value. Safe to
 * call unconditionally from AppInner.
 */
export default function useArcadeTokenReceiver() {
    useEffect(() => {
        let cancelled = false;

        try {
            const url = new URL(window.location.href);
            const token = url.searchParams.get('arcade_token');
            if (!token) return;

            // Strip the param eagerly so a refresh doesn't re-trigger
            // validation. The token is consumed once; staleness is fine.
            url.searchParams.delete('arcade_token');
            window.history.replaceState({}, '', url.toString());

            const apiBase = window.location.origin; // same-origin (solshot.gg)
            fetch(`${apiBase}/api/arcade/session-validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            })
                .then(r => r.json())
                .then(payload => {
                    if (cancelled) return;
                    if (!payload?.ok || !payload?.claims) return;
                    // Stash hint for any UI that wants to acknowledge the
                    // arrival. Cleared by the welcome banner on dismiss.
                    try {
                        localStorage.setItem(
                            'solshot_arcade_referral',
                            JSON.stringify({
                                handle: payload.claims.handle || null,
                                walletAddress: payload.claims.walletAddress || null,
                                receivedAt: Date.now(),
                            })
                        );
                    } catch {
                        /* localStorage unavailable — no-op */
                    }
                })
                .catch(() => {
                    /* Network/validation failure is silent — token is
                       a hint, not auth. User continues normal flow. */
                });
        } catch {
            /* URL parsing failure — no-op */
        }

        return () => {
            cancelled = true;
        };
    }, []);
}
