/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVY_APP_ID: string;
  readonly VITE_SOLSHOT_API_BASE: string;
  readonly VITE_SOLANA_NETWORK: 'devnet' | 'mainnet-beta';
  readonly VITE_SOLANA_RPC: string;
  readonly VITE_SOLSHOT_WEB_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
