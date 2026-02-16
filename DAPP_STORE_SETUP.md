# SolShot — Solana dApp Store (Seeker) Setup Guide

## Overview

SolShot is packaged as a PWA (Progressive Web App) wrapped into a TWA (Trusted Web Activity) APK for submission to the Solana dApp Store. The TWA runs in Chrome's engine on Android — it renders exactly like mobile Chrome with no WebView quirks.

## Prerequisites

- SolShot deployed to HTTPS domain
- Node.js 18+
- Android Studio (for keystore generation)
- Java JDK 11+ (for keystore)

## Step 1: Verify PWA

Before wrapping, ensure the PWA criteria are met:

```bash
# Build production client
cd client && npm run build

# Serve locally and check with Lighthouse
npx serve -s build
# Open Chrome DevTools > Lighthouse > PWA audit
```

Required checks:
- manifest.json is valid
- Service worker registers
- Icons (192x192 + 512x512) are present
- `display: standalone` is set
- `start_url` is valid

## Step 2: Generate Signing Keystore

Create a NEW keystore exclusively for the dApp Store. Never share with other stores.

```bash
keytool -genkeypair \
  -alias solshot \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -keystore solshot-release.keystore \
  -storepass YOUR_STORE_PASSWORD \
  -keypass YOUR_KEY_PASSWORD \
  -dname "CN=SolShot, O=SolShot, L=Unknown, ST=Unknown, C=US"
```

**Back up this keystore securely.** You cannot update the app without it.

## Step 3: Get SHA256 Fingerprint

```bash
keytool -list -v -keystore solshot-release.keystore -alias solshot
```

Copy the `SHA256:` fingerprint and update:
- `client/public/.well-known/assetlinks.json` — replace the TODO with the fingerprint
- Deploy the updated `assetlinks.json` to your production server

## Step 4: Install Bubblewrap CLI

```bash
npm install -g @nicolo-ribaudo/bubblewrap
```

## Step 5: Initialize TWA Project

```bash
mkdir twa && cd twa
bubblewrap init --manifest https://your-domain.com/manifest.json
```

This generates a `twa-manifest.json`. Edit it to match:

```json
{
  "packageId": "io.solshot.game",
  "host": "your-domain.com",
  "name": "SolShot",
  "launchUrl": "/",
  "display": "standalone",
  "orientation": "landscape",
  "themeColor": "#0a0c08",
  "navigationColor": "#0a0c08",
  "backgroundColor": "#0a0c08",
  "enableNotifications": false,
  "isChromeOSOnly": false,
  "splashScreenFadeOutDuration": 300,
  "signingKey": {
    "path": "../solshot-release.keystore",
    "alias": "solshot"
  },
  "appVersionName": "0.5.0",
  "appVersionCode": 1
}
```

## Step 6: Build APK

```bash
bubblewrap build
```

This produces:
- `app-release-signed.apk` — the signed APK
- `app-release-bundle.aab` — the signed bundle

## Step 7: Test on Device

```bash
adb install app-release-signed.apk
```

Verify:
- App launches in fullscreen landscape
- Wallet connection works via Mobile Wallet Adapter
- Game plays correctly
- No browser chrome is visible

## Step 8: Submit to Solana dApp Store

1. Go to the Solana dApp Store publisher portal
2. Create a new app listing
3. Upload the APK/AAB
4. Fill in metadata from `dapp-store/config.yaml`
5. Upload screenshots and promotional images
6. Submit for review

## Mobile Wallet Adapter

The app uses `@solana-mobile/wallet-adapter-mobile` for native wallet connections on Saga/Seeker devices. This is already configured in `wallet/WalletContext.js`.

To install the package:

```bash
cd client
npm install @solana-mobile/wallet-adapter-mobile
```

Then add to wallet list in WalletContext.js:

```javascript
import { SolanaMobileWalletAdapter } from '@solana-mobile/wallet-adapter-mobile';

const wallets = useMemo(() => [
  new SolanaMobileWalletAdapter({
    appIdentity: {
      name: 'SolShot',
      uri: 'https://your-domain.com',
      icon: 'https://your-domain.com/icon-192.png',
    },
    authorizationResultCache: createDefaultAuthorizationResultCache(),
    cluster: NETWORK === 'mainnet-beta' ? 'mainnet-beta' : 'devnet',
  }),
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
], []);
```

## Digital Asset Links

The `.well-known/assetlinks.json` file must be:
- Accessible at `https://your-domain.com/.well-known/assetlinks.json`
- Served with `Content-Type: application/json`
- Contains the correct SHA256 fingerprint from your signing keystore

This proves domain ownership for TWA verification.

## Notes

- **Orientation:** `landscape` in manifest ensures the game displays correctly
- **Service worker:** Minimal (app shell caching only) — no offline gameplay (requires server)
- **Chrome version:** TWA uses the device's Chrome — test on Android 10+ (Chrome 80+)
- **Keystore:** Generate a new keystore exclusively for dApp Store. Never share with other stores.
- **Updates:** Version code must increment with each new APK upload
