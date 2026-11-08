import 'server-only'
import { createDecipheriv, randomInt } from 'node:crypto'
import { readText, safeFetch } from '@/lib/security/safe-fetch'
import type { HostResolver, ResolverOutcome } from './types'

function b64(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/').replace(/,/g, ''), 'base64')
}

/** Mega's 256-bit file key packs AES key ⊕ nonce; the real key is the XOR fold. */
function unpackFileKey(raw: Buffer) {
  const key = Buffer.alloc(16)
  for (let i = 0; i < 16; i++) key[i] = raw[i] ^ raw[i + 16]
  const iv = Buffer.concat([raw.subarray(16, 24), Buffer.alloc(8)])
  return { key, iv }
}

function decryptAttributes(at: string, key: Buffer): { n?: string } {
  try {
    const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16))
    decipher.setAutoPadding(false)
    const text = Buffer.concat([decipher.update(b64(at)), decipher.final()]).toString('utf8').replace(/\0+$/, '')
    if (!text.startsWith('MEGA{')) return {}
    return JSON.parse(text.slice(4, text.lastIndexOf('}') + 1))
  } catch {
    return {}
  }
}

async function api(body: unknown, folder?: string) {
  const qs = `id=${randomInt(1e9)}${folder ? `&n=${folder}` : ''}`
  const { res } = await safeFetch(`https://g.api.mega.co.nz/cs?${qs}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://mega.nz', referer: 'https://mega.nz/' },
    body: JSON.stringify([body]),
  })
  const json = JSON.parse(await readText(res))
  const first = Array.isArray(json) ? json[0] : json
  if (typeof first === 'number') throw new Error(megaError(first))
  return first
}

function megaError(code: number) {
  const map: Record<number, string> = {
    [-2]: 'Invalid link arguments',
    [-3]: 'Mega is rate-limiting — try again shortly',
    [-9]: 'File not found or removed',
    [-11]: 'Access denied',
    [-16]: 'File owner account is suspended',
    [-17]: 'Mega transfer quota exceeded for this IP',
    [-18]: 'Mega temporarily unavailable',
  }
  return map[code] ?? `Mega API error ${code}`
}

export const megaResolver: HostResolver = {
  id: 'mega',
  label: 'Mega',
  match: /(^|\.)mega\.(nz|co\.nz|io)$/i,
  async resolve(url, { log }): Promise<ResolverOutcome> {
    const full = url.toString()
    const file = full.match(/\/file\/([\w-]{8})#([\w,-]{43})/) ?? full.match(/#!([\w-]{8})!([\w,-]{43})/)
    const folder = full.match(/\/folder\/([\w-]{8})#([\w,-]{22})(?:\/file\/([\w-]{8}))?/) ?? full.match(/#F!([\w-]{8})!([\w,-]{22})/)

    if (file) {
      const [, handle, keyB64] = file
      const { key, iv } = unpackFileKey(b64(keyB64))
      log('Mega · derived AES-128 key from link fragment')
      const info = await api({ a: 'g', g: 1, ssl: 2, p: handle })
      const attrs = decryptAttributes(info.at, key)
      log(`Mega · decrypted attributes → ${attrs.n ?? 'unknown name'}`)
      return {
        kind: 'file',
        host: 'mega',
        directUrl: info.g,
        filename: attrs.n,
        size: info.s,
        mega: { key: key.toString('hex'), iv: iv.toString('hex') },
        proxyOnly: true,
      }
    }

    if (folder) {
      const [, folderHandle, folderKeyB64, wanted] = folder
      const folderKey = b64(folderKeyB64)
      log('Mega · enumerating shared folder')
      const listing = await api({ a: 'f', c: 1, ca: 1, r: 1 }, folderHandle)
      const nodes = (listing.f ?? []) as Array<{ h: string; t: number; k: string; a: string; s: number }>
      const target = nodes.find((n) => n.t === 0 && (!wanted || n.h === wanted))
      if (!target) return { kind: 'error', host: 'mega', message: 'No files inside this Mega folder' }
      const encKey = b64(target.k.split(':').pop() ?? '')
      const ecb = createDecipheriv('aes-128-ecb', folderKey, null)
      ecb.setAutoPadding(false)
      const raw = Buffer.concat([ecb.update(encKey), ecb.final()])
      const { key, iv } = unpackFileKey(raw)
      const attrs = decryptAttributes(target.a, key)
      const info = await api({ a: 'g', g: 1, ssl: 2, n: target.h }, folderHandle)
      log(`Mega · folder file ${attrs.n ?? target.h} (${nodes.filter((n) => n.t === 0).length} files in folder)`)
      return {
        kind: 'file',
        host: 'mega',
        directUrl: info.g,
        filename: attrs.n,
        size: info.s,
        mega: { key: key.toString('hex'), iv: iv.toString('hex') },
        proxyOnly: true,
      }
    }

    return { kind: 'error', host: 'mega', message: 'Mega link is missing its decryption key (#...)' }
  },
}
