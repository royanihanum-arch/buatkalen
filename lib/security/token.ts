import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Download tickets are sealed with AES-256-GCM: confidentiality (upstream
 * cookies and Mega keys never reach the browser in clear) plus integrity
 * (tampering fails auth-tag verification) and a hard expiry.
 */
const secretSource = process.env.LINK_SIGNING_SECRET ?? randomBytes(32).toString('hex')
const KEY = createHash('sha256').update(secretSource).digest()

export interface DownloadTicket {
  url: string
  filename?: string
  size?: number
  referer?: string
  cookie?: string
  mega?: { key: string; iv: string }
  exp: number
}

export function sealTicket(ticket: Omit<DownloadTicket, 'exp'>, ttlSeconds = 60 * 60): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const payload = Buffer.from(JSON.stringify({ ...ticket, exp: Date.now() + ttlSeconds * 1000 }))
  const enc = Buffer.concat([cipher.update(payload), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url')
}

export function openTicket(token: string): DownloadTicket | null {
  try {
    if (token.length > 8192) return null
    const raw = Buffer.from(token, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', KEY, raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
    const ticket = JSON.parse(json) as DownloadTicket
    if (typeof ticket.exp !== 'number' || ticket.exp < Date.now()) return null
    return ticket
  } catch {
    return null
  }
}
