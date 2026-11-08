import { createDecipheriv } from 'node:crypto'
import { Readable } from 'node:stream'
import { clientKey, rateLimit } from '@/lib/security/rate-limit'
import { safeFetch } from '@/lib/security/safe-fetch'
import { openTicket } from '@/lib/security/token'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function safeFilename(name: string | undefined): string {
  const cleaned = (name ?? 'download').replace(/[\u0000-\u001f"\\/<>:|?*]+/g, '_').slice(0, 180).trim()
  return cleaned || 'download'
}

export async function GET(request: Request) {
  const limit = rateLimit(clientKey(request.headers, 'download'), 20, 10)
  if (!limit.allowed) return new Response('Too many downloads', { status: 429, headers: { 'retry-after': String(limit.retryAfter) } })

  const token = new URL(request.url).searchParams.get('t')
  const ticket = token ? openTicket(token) : null
  if (!ticket) return new Response('Download ticket is invalid or expired', { status: 403 })

  const headers: Record<string, string> = {}
  if (ticket.referer) headers.referer = ticket.referer
  if (ticket.cookie) headers.cookie = ticket.cookie
  const range = request.headers.get('range')
  if (range && !ticket.mega && /^bytes=\d*-\d*$/.test(range)) headers.range = range

  const { res } = await safeFetch(ticket.url, { headers, signal: request.signal })
  if (!res.ok || !res.body) return new Response(`Upstream responded ${res.status}`, { status: 502 })

  let body: ReadableStream = res.body as unknown as ReadableStream
  if (ticket.mega) {
    const decipher = createDecipheriv('aes-128-ctr', Buffer.from(ticket.mega.key, 'hex'), Buffer.from(ticket.mega.iv, 'hex'))
    body = Readable.toWeb(Readable.fromWeb(res.body as never).pipe(decipher)) as ReadableStream
  }

  const filename = safeFilename(ticket.filename)
  const out = new Headers({
    'content-type': ticket.mega ? 'application/octet-stream' : (res.headers.get('content-type') ?? 'application/octet-stream'),
    'content-disposition': `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
  })
  const length = res.headers.get('content-length')
  if (length) out.set('content-length', length)
  if (!ticket.mega) {
    for (const h of ['content-range', 'accept-ranges']) {
      const v = res.headers.get(h)
      if (v) out.set(h, v)
    }
  }
  return new Response(body, { status: res.status === 206 ? 206 : 200, headers: out })
}
