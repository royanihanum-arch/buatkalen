import { resolveLink } from '@/lib/resolver/engine'
import { clientKey, isSameOrigin, rateLimit } from '@/lib/security/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const noStore = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }

export async function POST(request: Request) {
  if (!isSameOrigin(request.headers)) {
    return Response.json({ status: 'error', message: 'Cross-origin request rejected' }, { status: 403, headers: noStore })
  }
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return Response.json({ status: 'error', message: 'Expected JSON' }, { status: 415, headers: noStore })
  }
  const limit = rateLimit(clientKey(request.headers, 'resolve'), 12, 12)
  if (!limit.allowed) {
    return Response.json(
      { status: 'error', message: `Slow down — retry in ${limit.retryAfter}s` },
      { status: 429, headers: { ...noStore, 'retry-after': String(limit.retryAfter) } },
    )
  }

  const raw = await request.text()
  if (raw.length > 4096) return Response.json({ status: 'error', message: 'Payload too large' }, { status: 413, headers: noStore })

  let url: unknown
  try {
    url = (JSON.parse(raw) as { url?: unknown }).url
  } catch {
    return Response.json({ status: 'error', message: 'Malformed JSON' }, { status: 400, headers: noStore })
  }
  if (typeof url !== 'string' || url.length < 8 || url.length > 2048 || /[\u0000-\u001f\s]/.test(url.trim())) {
    return Response.json({ status: 'error', message: 'Provide a single valid http(s) link' }, { status: 400, headers: noStore })
  }

  const result = await resolveLink(url.trim())
  return Response.json(result, { headers: noStore })
}
