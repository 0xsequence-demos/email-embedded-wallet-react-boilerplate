import { SequenceWaaS } from '@0xsequence/waas'

export const projectAccessKey = import.meta.env.VITE_PROJECT_ACCESS_KEY
export const waasConfigKey = import.meta.env.VITE_WAAS_CONFIG_KEY

// IMPORTANT:
// We intentionally pass `cryptoBackend = null` to force the SDK to use the SECP256K1
// session (stored as an extractable private key string in IndexedDB).
//
// If we allow the default WebCrypto backend, the SDK uses a P-256 (secp256r1) session
// backed by a non-extractable CryptoKeyPair, which we cannot export/encrypt for headless use.
export const sequence = new SequenceWaaS(
  {
    projectAccessKey,
    waasConfigKey,
    network: 'polygon'
  },
  undefined,
  null
)
