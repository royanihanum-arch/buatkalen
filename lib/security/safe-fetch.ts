import 'server-only'
import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import { isIP } from 'node:net'
import { Agent, fetch as undiciFetch, type RequestInit, type Response } from 'undici'
import { isPublicIp } from './ip'

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

export class BlockedError extends Error {}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void

/**
 * DNS lookup that validates every resolved address inside the socket's own
 * resolution step. Because the check happens on the exact IP the socket
 * connects to, DNS-rebinding TOCTOU attacks are not possible.
 */
function guardedLookup(hostname: string, options: { all?: boolean; family?: number } | number, callback: LookupCallback) {
  const opts = typeof options === 'number' ? { family: options } : options ?? {}
  dnsLookup(hostname, { ...opts, all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err, opts.all ? [] : '', 0)
    const list = addresses as LookupAddress[]
    const allowed = list.filter((a) => isPublicIp(a.address))
    if (allowed.length === 0 || allowed.length !== list.length) {
      const blocked = new Error(`Blocked non-public address for ${hostname}`) as NodeJS.ErrnoException
      blocked.code = 'EBLOCKED'
      return callback(blocked, opts.all ? [] : '', 0)
    }
    if (opts.all) return callback(null, allowed)
    callback(null, allowed[0].address, allowed[0].family)
  })
}

const dispatcher = new Agent({
  connect: { lookup: guardedLookup as never, timeout: 10_000 },
  headersTimeout: 20_000,
  bodyTimeout: 120_000,
})

const ALLOWED_PORTS = new Set(['', '80', '443'])

export function assertSafeUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new BlockedError('Invalid URL')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new BlockedError('Only http(s) links are allowed')
  if (url.username || url.password) throw new BlockedError('Credentials in URLs are not allowed')
  if (!ALLOWED_PORTS.has(url.port)) throw new BlockedError('Non-standard ports are not allowed')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new BlockedError('Internal hostnames are not allowed')
  }
  if (isIP(host) && !isPublicIp(host)) throw new BlockedError('Private network targets are not allowed')
  return url
}

export class CookieJar {
  private store = new Map<string, string>()
  absorb(res: Response) {
    const raw = res.headers.getSetCookie?.() ?? []
    for (const line of raw) {
      const [pair] = line.split(';')
      const idx = pair.indexOf('=')
      if (idx > 0) this.store.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim())
    }
  }
  set(name: string, value: string) {
    this.store.set(name, value)
  }
  header(): string {
    return [...this.store].map(([k, v]) => `${k}=${v}`).join('; ')
  }
  get size() {
    return this.store.size
  }
}

export interface SafeFetchOptions extends Omit<RequestInit, 'redirect' | 'dispatcher'> {
  jar?: CookieJar
  maxHops?: number
  followRedirects?: boolean
  onHop?: (url: string, status: number) => void
}

export interface SafeResponse {
  res: Response
  finalUrl: string
}

export async function safeFetch(input: string, options: SafeFetchOptions = {}): Promise<SafeResponse> {
  const { jar, maxHops = 10, followRedirects = true, onHop, headers, ...init } = options
  let current = assertSafeUrl(input).toString()
  let method = init.method ?? 'GET'
  let body = init.body

  for (let hop = 0; hop <= maxHops; hop++) {
    const merged = new Headers({
      'user-agent': BROWSER_UA,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
      'accept-language': 'en-US,en;q=0.9',
    })
    new Headers(headers as HeadersInit | undefined).forEach((v, k) => merged.set(k, v))
    if (jar?.size) merged.set('cookie', [merged.get('cookie'), jar.header()].filter(Boolean).join('; '))

    const res = await undiciFetch(current, {
      ...init,
      method,
      body,
      headers: merged,
      redirect: 'manual',
      dispatcher,
      signal: init.signal ?? AbortSignal.timeout(25_000),
    })
    jar?.absorb(res)
    onHop?.(current, res.status)

    const location = res.headers.get('location')
    if (followRedirects && res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel().catch(() => {})
      current = assertSafeUrl(new URL(location, current).toString()).toString()
      if (res.status !== 307 && res.status !== 308) {
        method = 'GET'
        body = undefined
      }
      continue
    }
    return { res, finalUrl: current }
  }
  throw new BlockedError('Too many redirects')
}

const MAX_TEXT_BYTES = 3 * 1024 * 1024

export async function readText(res: Response): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_TEXT_BYTES) {
      await reader.cancel()
      break
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

export async function fetchText(url: string, options: SafeFetchOptions = {}) {
  const { res, finalUrl } = await safeFetch(url, options)
  const text = await readText(res)
  return { res, finalUrl, text }
}
