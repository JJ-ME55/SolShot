/**
 * JupiterMobileAdapter — Fallback wallet adapter for Jupiter Mobile.
 *
 * This file is a safety net used when @jup-ag/jup-mobile-adapter is unavailable.
 * When the package IS installed, WalletContext.js uses useWrappedReownAdapter instead.
 *
 * Behavior: Opens jup.ag/mobile in a new tab (promotional placeholder, not a real connection).
 */

import {
    BaseWalletAdapter,
    WalletReadyState,
    WalletNotConnectedError,
} from '@solana/wallet-adapter-base';

export class JupiterMobileAdapter extends BaseWalletAdapter {
    name = 'Jupiter';
    url = 'https://jup.ag/mobile';
    icon = 'https://jup.ag/favicon.ico';
    readyState = WalletReadyState.Loadable;
    publicKey = null;
    connecting = false;

    get connected() {
        return false;
    }

    async connect() {
        window.open('https://jup.ag/mobile', '_blank');
        this.emit('connect', this.publicKey);
    }

    async disconnect() {
        this.emit('disconnect');
    }

    async sendTransaction() {
        throw new WalletNotConnectedError();
    }
}
