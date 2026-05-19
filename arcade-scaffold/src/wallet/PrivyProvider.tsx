import type { ReactNode } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;
const NETWORK = import.meta.env.VITE_SOLANA_NETWORK ?? 'devnet';

interface Props {
  children: ReactNode;
}

/**
 * Wraps the app in the shared SolShot Privy app. Same `appId`, just a
 * new allowed origin in the Privy dashboard. Callsigns carry across
 * both sites because Privy keys identity off the user's wallet/email,
 * not the origin.
 *
 * If VITE_PRIVY_APP_ID is unset (initial Vercel deploy before JJ
 * configures env vars), this renders children directly so the build
 * succeeds and the cabinet landing is reachable.
 */
export function ArcadePrivyProvider({ children }: Props) {
  if (!PRIVY_APP_ID) {
    if (import.meta.env.DEV) {
      console.warn(
        '[PrivyProvider] VITE_PRIVY_APP_ID not set — Privy is disabled. ' +
          'Set it in .env to enable sign-in.'
      );
    }
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google', 'telegram'],
        appearance: {
          theme: 'dark',
          accentColor: '#FFD23A',
          logo: undefined,
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        solanaClusters: [
          {
            name: NETWORK === 'mainnet-beta' ? 'mainnet-beta' : 'devnet',
            rpcUrl:
              import.meta.env.VITE_SOLANA_RPC ??
              (NETWORK === 'mainnet-beta'
                ? 'https://api.mainnet-beta.solana.com'
                : 'https://api.devnet.solana.com'),
          },
        ],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
