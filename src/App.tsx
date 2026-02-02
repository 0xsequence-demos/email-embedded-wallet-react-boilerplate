import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { sequence } from './config.ts'

import sealedbox from 'tweetnacl-sealedbox-js'

async function idbGet(dbName: string, storeName: string, key: string): Promise<any | null> {
  return new Promise((resolve, reject) => {
    // NOTE: if the DB exists but the store doesn't, attempting a transaction throws NotFoundError.
    const req = indexedDB.open(dbName)

    req.onerror = () => reject(req.error)

    req.onupgradeneeded = () => {
      // If this DB is being created for the first time and doesn't have the expected store yet,
      // we can't read anything. Don't create stores here (we want the WaaS SDK to own schema).
      resolve(null)
    }

    req.onsuccess = () => {
      const db = req.result
      try {
        if (!db.objectStoreNames.contains(storeName)) {
          resolve(null)
          return
        }
        const tx = db.transaction(storeName, 'readonly')
        const store = tx.objectStore(storeName)
        const getReq = store.get(key)
        getReq.onerror = () => reject(getReq.error)
        getReq.onsuccess = () => resolve(getReq.result ?? null)
      } catch (e) {
        reject(e)
      }
    }
  })
}

function b64urlDecode(str: string): Uint8Array {
  const norm = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4))
  const bin = atob(norm + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function App() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const rid = params.get('rid') || ''
  const walletName = params.get('wallet') || ''
  const pub = params.get('pub') || ''

  const [awaitingEmailCodeInput, setAwaitingEmailCodeInput] = useState(false)
  const [walletAddress, setWalletAddress] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [otpAnswer, setOtpAnswer] = useState<string>('')
  const [respondWithCode, setRespondWithCode] = useState<((code: string) => Promise<void>) | null>(null)

  const [ciphertext, setCiphertext] = useState<string>('')
  const [sessionId, setSessionId] = useState<string>('')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    sequence.onEmailAuthCodeRequired(async respondWithCode => {
      setRespondWithCode(() => respondWithCode)
    })
  }, [])

  useEffect(() => {
    setTimeout(async () => {
      if (/^\d{6}$/.test(otpAnswer) && respondWithCode) {
        try {
          await respondWithCode(otpAnswer)
        } catch (err) {
          console.log(err)
          setError('Invalid code. Please try again.')
        }
      }
    })
  }, [otpAnswer, respondWithCode])

  const signIn = async () => {
    setError('')
    setAwaitingEmailCodeInput(true)

    if (!awaitingEmailCodeInput) {
      const emailResponse: any = await sequence.signIn({ email }, 'moltbot wallet auth')
      setWalletAddress(emailResponse.wallet)
      setSessionId(emailResponse.sessionId)

      try {
        if (!rid || !walletName || !pub) {
          throw new Error('Missing rid/wallet/pub in URL. Ask Bloom to generate a fresh link.')
        }

        // We force SECP256K1 sessions (see config.ts). The private key is stored in IndexedDB:
        // db: seq-waas-session-p256k1, store: seq-waas-session, key: sessionId (address)
        const privateKey = await idbGet('seq-waas-session-p256k1', 'seq-waas-session', emailResponse.sessionId)
        if (!privateKey) {
          throw new Error(
            'Could not locate session private key in secure store. ' +
              'This usually means the SDK is using a non-extractable P-256 session; ensure cryptoBackend=null (SECP256K1) in config.'
          )
        }

        const pubBytes = b64urlDecode(pub)
        const msg = new TextEncoder().encode(String(privateKey))
        const sealed = sealedbox.seal(msg, pubBytes)
        setCiphertext(b64urlEncode(sealed))
      } catch (e: any) {
        console.error(e)
        setError(e?.message || String(e))
      }
    }
  }

  const copyCiphertext = async () => {
    if (!ciphertext) return
    await navigator.clipboard.writeText(ciphertext)
  }

  const setEmailInput = (input: string) => {
    if (!awaitingEmailCodeInput) setEmail(input)
    else setOtpAnswer(input)
  }

  return (
    <>
      <h1>moltbot wallet link</h1>

      <div style={{ opacity: 0.8, fontSize: 12, marginBottom: 12 }}>
        <div><b>rid</b>: {rid || '(missing)'}</div>
        <div><b>wallet</b>: {walletName || '(missing)'}</div>
      </div>

      {!walletAddress && (
        <>
          <input
            value={awaitingEmailCodeInput ? otpAnswer : email}
            onChange={(evt: any) => setEmailInput(evt.target.value)}
            className='email-code'
            placeholder={!awaitingEmailCodeInput ? 'email' : 'email code'}
          />
          <button onClick={() => signIn()}>{awaitingEmailCodeInput ? 'waiting for code…' : 'sign in'}</button>
          {error && <p style={{ color: 'tomato' }}>{error}</p>}
        </>
      )}

      {walletAddress && (
        <>
          <div className={'wallet-address'}>{walletAddress}</div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
            sessionId: {sessionId}
          </div>

          {ciphertext && (
            <>
              <h3 style={{ marginTop: 18 }}>Step 2 — Send ciphertext to Bloom</h3>
              <p style={{ maxWidth: 520 }}>
                Copy the encrypted session string below and send it to Bloom on Telegram.
                This is encrypted to Bloom’s one-time public key.
              </p>
              <textarea readOnly value={ciphertext} style={{ width: '100%', maxWidth: 720, height: 140 }} />
              <div style={{ marginTop: 8 }}>
                <button onClick={copyCiphertext}>Copy ciphertext</button>
              </div>
              <p style={{ fontSize: 12, opacity: 0.7 }}>
                Bloom will run: <code>seq.mjs ingest-session --name {walletName} --rid {rid} --ciphertext ...</code>
              </p>
            </>
          )}

          {error && <p style={{ color: 'tomato' }}>{error}</p>}
        </>
      )}
    </>
  )
}

export default App
