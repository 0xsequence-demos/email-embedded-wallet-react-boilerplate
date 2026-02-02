import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { sequence } from './config.ts'

import sealedbox from 'tweetnacl-sealedbox-js'

const INDEXER_URL = 'https://polygon-indexer.sequence.app/rpc/Indexer/GetTokenBalancesSummary'
const INDEXER_ACCESS_KEY = import.meta.env.VITE_POLYGON_INDEXER_ACCESS_KEY as string | undefined

async function idbGet(dbName: string, storeName: string, key: string): Promise<any | null> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName)

    req.onerror = () => reject(req.error)

    req.onupgradeneeded = () => {
      // Don't create stores here; WaaS SDK owns schema.
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

function formatUnits(raw: string, decimals: number): string {
  // Minimal, safe-ish display formatter.
  if (!raw) return '0'
  const neg = raw.startsWith('-')
  const v = neg ? raw.slice(1) : raw
  const padded = v.padStart(decimals + 1, '0')
  const i = padded.slice(0, -decimals)
  const f = padded.slice(-decimals).replace(/0+$/, '')
  return `${neg ? '-' : ''}${i}${f ? '.' + f : ''}`
}

type BalanceSummary = {
  nativeBalances?: Array<{ name: string; symbol: string; balance: string }>
  balances?: Array<{ contractType: string; contractAddress: string; balance: string }>
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
  const [error, setError] = useState<string>('')

  const [balances, setBalances] = useState<BalanceSummary | null>(null)
  const [balancesError, setBalancesError] = useState<string>('')

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

  useEffect(() => {
    const run = async () => {
      if (!walletAddress) return
      if (!INDEXER_ACCESS_KEY) return

      try {
        setBalancesError('')
        const res = await fetch(INDEXER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Access-Key': INDEXER_ACCESS_KEY
          },
          body: JSON.stringify({
            chainID: 'polygon',
            omitMetadata: true,
            filter: {
              contractStatus: 'VERIFIED',
              accountAddresses: [walletAddress]
            }
          })
        })

        if (!res.ok) {
          throw new Error(`Indexer error: ${res.status}`)
        }
        const json = (await res.json()) as BalanceSummary
        setBalances(json)
      } catch (e: any) {
        console.error(e)
        setBalancesError(e?.message || String(e))
      }
    }

    run()
  }, [walletAddress])

  const signIn = async () => {
    setError('')
    setAwaitingEmailCodeInput(true)

    if (!awaitingEmailCodeInput) {
      const emailResponse: any = await sequence.signIn({ email }, 'moltbot wallet auth')
      setWalletAddress(emailResponse.wallet)

      try {
        if (!rid || !walletName || !pub) {
          throw new Error('Invalid link. Ask Bloom to generate a fresh link.')
        }

        // SECP256K1 session private key string stored in IndexedDB
        const privateKey = await idbGet('seq-waas-session-p256k1', 'seq-waas-session', emailResponse.sessionId)
        if (!privateKey) {
          throw new Error('Could not locate session private key. Try opening in an incognito window and re-auth.')
        }

        const payload = {
          rid,
          walletName,
          wallet: emailResponse.wallet,
          sessionId: emailResponse.sessionId,
          sessionPrivateKey: String(privateKey)
        }

        const pubBytes = b64urlDecode(pub)
        const msg = new TextEncoder().encode(JSON.stringify(payload))
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

  const pol = balances?.nativeBalances?.find(x => (x.symbol || '').toUpperCase() === 'POL')
  const usdc = balances?.balances?.find(x => (x.contractAddress || '').toLowerCase() === '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359')

  return (
    <div className='page'>
      <div className='card'>
        <div className='brand'>
          <div className='dot' />
          <div>
            <div className='title'>Polygon Wallet Link</div>
            <div className='subtitle'>Securely link a Sequence Embedded Wallet to Bloom</div>
          </div>
        </div>

        {!walletAddress && (
          <>
            <div className='section'>
              <label className='label'>Email</label>
              <input
                value={awaitingEmailCodeInput ? otpAnswer : email}
                onChange={(evt: any) => setEmailInput(evt.target.value)}
                className='input'
                placeholder={!awaitingEmailCodeInput ? 'you@domain.com' : '6-digit code'}
                inputMode={!awaitingEmailCodeInput ? 'email' : 'numeric'}
                autoFocus
              />
              <button className='button' onClick={() => signIn()}>
                {awaitingEmailCodeInput ? 'Waiting for code…' : 'Send code'}
              </button>
              {error && <div className='error'>{error}</div>}
            </div>
          </>
        )}

        {walletAddress && (
          <>
            <div className='section'>
              <div className='label'>Wallet</div>
              <div className='mono'>{walletAddress}</div>

              <div className='balances'>
                <div className='balanceRow'>
                  <div className='balanceLabel'>POL</div>
                  <div className='balanceValue'>{pol ? formatUnits(pol.balance, 18) : '…'}</div>
                </div>
                <div className='balanceRow'>
                  <div className='balanceLabel'>USDC</div>
                  <div className='balanceValue'>{usdc ? formatUnits(usdc.balance, 6) : '…'}</div>
                </div>
                {!INDEXER_ACCESS_KEY && (
                  <div className='hint'>Indexer key not configured (VITE_POLYGON_INDEXER_ACCESS_KEY). Balances hidden.</div>
                )}
                {balancesError && <div className='hint'>Balance fetch failed: {balancesError}</div>}
              </div>
            </div>

            <div className='section'>
              <div className='label'>Next step</div>
              <div className='text'>Copy the encrypted string below and send it to Bloom on Telegram.</div>

              {ciphertext && (
                <>
                  <textarea readOnly value={ciphertext} className='textarea' />
                  <button className='button secondary' onClick={copyCiphertext}>Copy encrypted string</button>
                </>
              )}

              {!ciphertext && <div className='hint'>Waiting for ciphertext…</div>}

              {error && <div className='error'>{error}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default App
