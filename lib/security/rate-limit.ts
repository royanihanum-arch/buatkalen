import 'server-only'
import { createHash } from 'node:crypto'

interface Bucket {
  tokens: number
  updated: number
}

const buckets = new Map<string, Bucket>()

/**
 * Token-bucket limiter keyed by a hashed client fingerprint. In-memory per
 * instance: for multi-region production traffic, back this with Upstash Redis.
 */
export function rateLimit(key: string, capacity: number, refillPerMinute: number) {
  const now = Date.now()
  const bucket = buckets.get(key) ?? { tokens: capacity, updated: now }
  bucket.tokens = Math.min(capacity, bucket.tokens + ((now - bucket.updated) / 60_000) * refillPerMinute)
  bucket.updated = now
  const allowed = bucket.tokens >= 1
  if (allowed) bucket.tokens -= 1
  buckets.set(key, bucket)
  if (buckets.size > 50_000) {
    for (const [k, b] of buckets) if (now - b.updated > 10 * 60_000) buckets.delete(k)
  }
  const retryAfter = allowed ? 0 : Math.ceil(((1 - bucket.tokens) / refillPerMinute) * 60)
  return { allowed, retryAfter, remaining: Math.floor(bucket.tokens) }
}

export function clientKey(headers: Headers, scope: string): string {
  const ip =
    headers.get('x-real-ip') ??
    headers.get('x-vercel-forwarded-for')?.split(',')[0] ??
    headers.get('x-forwarded-for')?.split(',')[0] ??
    'unknown'
  return createHash('sha256').update(`${scope}:${ip.trim()}`).digest('base64url')
}

export function isSameOrigin(headers: Headers): boolean {
  const site = headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = headers.get('origin')
  const host = headers.get('x-forwarded-host') ?? headers.get('host')
  if (origin && host) {
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  }
  return true
}
