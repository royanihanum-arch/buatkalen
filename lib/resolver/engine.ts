import 'server-only'
import { BlockedError, CookieJar, assertSafeUrl, readText, safeFetch } from '@/lib/security/safe-fetch'
import { sealTicket } from '@/lib/security/token'
import { absolute, decodeMaybeBase64Url, detectCaptcha, filenameFromDisposition, findInPageRedirect, load } from './html'
import { findHost, HOSTS } from './hosts'
import type { PublicResult, ResolveContext, ResolverOutcome } from './types'

const WRAPPER_PARAMS = ['url', 'u', 'link', 'target', 'dest', 'destination', 'redirect', 'redirect_url', 'redir', 'r', 'go', 'to', 'out', 'href', 'continue', 'next', 'file', 'q']
const MAX_LAYERS = 8

function unwrapQuery(url: URL): string | null {
  for (const key of WRAPPER_PARAMS) {
    const value = url.searchParams.get(key)
    if (!value) continue
    const decoded = decodeMaybeBase64Url(value) ?? decodeMaybeBase64Url(decodeURIComponent(value))
    if (decoded && decoded !== url.toString()) return decoded
  }
  const fragment = url.hash.slice(1)
  if (fragment) {
    const decoded = decodeMaybeBase64Url(fragment)
    if (decoded) return decoded
  }
  return null
}

/** One layer of generic shortlink / redirector / protector unwrapping. */
async function genericLayer(url: URL, ctx: ResolveContext): Promise<ResolverOutcome> {
  const unwrapped = unwrapQuery(url)
  if (unwrapped) {
    ctx.log(`Unwrapped encoded target from ${url.hostname}`)
    return { kind: 'next', url: unwrapped }
  }

  const { res, finalUrl } = await safeFetch(url.toString(), {
    jar: ctx.jar,
    onHop: (hop, status) => {
      if (status >= 300 && status < 400) ctx.log(`HTTP ${status} · ${new URL(hop).hostname}`)
    },
  })
  const final = new URL(finalUrl)
  if (final.toString() !== url.toString() && findHost(final)) return { kind: 'next', url: finalUrl }

  const type = res.headers.get('content-type') ?? ''
  const disposition = res.headers.get('content-disposition')
  if (disposition?.includes('attachment') || (!type.includes('html') && !type.includes('json') && !type.startsWith('text/'))) {
    await res.body?.cancel()
    return {
      kind: 'file',
      host: final.hostname,
      directUrl: finalUrl,
      filename: filenameFromDisposition(disposition) ?? (decodeURIComponent(final.pathname.split('/').pop() ?? '') || undefined),
      size: Number(res.headers.get('content-length')) || undefined,
    }
  }

  const html = await readText(res)
  const inPage = findInPageRedirect(html, finalUrl)
  if (inPage && inPage !== finalUrl) {
    ctx.log(`Followed in-page redirect on ${final.hostname}`)
    return { kind: 'next', url: inPage }
  }

  if (final.toString() !== url.toString()) return { kind: 'next', url: finalUrl }

  const $ = load(html)
  const hostLinks = $('a[href]')
    .map((_, a) => absolute($(a).attr('href'), finalUrl))
    .get()
    .filter((href): href is string => Boolean(href))
    .filter((href) => {
      try {
        return findHost(new URL(href)) !== undefined
      } catch {
        return false
      }
    })
  if (hostLinks.length) {
    ctx.log(`Found file-host link embedded in ${final.hostname}`)
    return { kind: 'next', url: hostLinks[0] }
  }

  const captcha = detectCaptcha(html)
  if (captcha) {
    return {
      kind: 'captcha',
      host: final.hostname,
      provider: captcha.provider,
      sitekey: captcha.sitekey,
      pageUrl: finalUrl,
      hint: `${final.hostname} protects its destination with a human check.`,
    }
  }

  const form = $('form[action]').filter((_, f) => /go|link|continue|get|download/i.test($(f).text() + ($(f).attr('action') ?? ''))).first()
  if (form.length && /countdown|timer|please wait|seconds/i.test(html)) {
    return {
      kind: 'captcha',
      host: final.hostname,
      provider: 'gate',
      pageUrl: finalUrl,
      hint: `${final.hostname} uses a timed ad-gate that must be completed in a real browser.`,
    }
  }

  return { kind: 'error', host: final.hostname, message: `No destination found on ${final.hostname}` }
}

export async function resolveLink(input: string): Promise<PublicResult> {
  const started = Date.now()
  const steps: string[] = []
  const ctx: ResolveContext = { log: (m) => steps.push(m), jar: new CookieJar() }
  const seen = new Set<string>()
  let current = input

  try {
    for (let layer = 0; layer < MAX_LAYERS; layer++) {
      const url = assertSafeUrl(current)
      if (seen.has(url.toString())) throw new Error('Redirect loop detected')
      seen.add(url.toString())

      const host = findHost(url)
      steps.push(host ? `Matched native resolver · ${host.label}` : `Probing ${url.hostname}`)
      const outcome = host ? await host.resolve(url, ctx) : await genericLayer(url, ctx)

      if (outcome.kind === 'next') {
        current = outcome.url
        continue
      }
      if (outcome.kind === 'error') {
        return { status: 'error', host: outcome.host, message: outcome.message, steps, elapsedMs: Date.now() - started }
      }
      if (outcome.kind === 'captcha') {
        steps.push(`Human verification required (${outcome.provider})`)
        return {
          status: 'captcha',
          host: outcome.host,
          provider: outcome.provider,
          sitekey: outcome.sitekey,
          pageUrl: outcome.pageUrl,
          message: outcome.hint,
          steps,
          elapsedMs: Date.now() - started,
        }
      }

      assertSafeUrl(outcome.directUrl)
      const needsProxy = Boolean(outcome.proxyOnly || outcome.cookie || outcome.mega)
      const ticket = sealTicket({
        url: outcome.directUrl,
        filename: outcome.filename,
        size: outcome.size,
        referer: outcome.referer,
        cookie: outcome.cookie,
        mega: outcome.mega,
      })
      steps.push(needsProxy ? 'Sealed streaming ticket issued' : 'Direct link extracted')
      return {
        status: 'ok',
        host: outcome.host,
        filename: outcome.filename,
        size: outcome.size,
        downloadUrl: `/api/download?t=${ticket}`,
        directUrl: needsProxy ? undefined : outcome.directUrl,
        steps,
        elapsedMs: Date.now() - started,
      }
    }
    throw new Error('Too many redirect layers')
  } catch (error) {
    const message =
      error instanceof BlockedError
        ? error.message
        : error instanceof Error && /EBLOCKED/.test(String((error as any).cause?.code ?? error.message))
          ? 'Target resolves to a private network address'
          : error instanceof Error && error.name === 'TimeoutError'
            ? 'Upstream host timed out'
            : error instanceof Error
              ? error.message.slice(0, 200)
              : 'Unknown failure'
    return { status: 'error', host: (() => { try { return new URL(current).hostname } catch { return 'unknown' } })(), message, steps, elapsedMs: Date.now() - started }
  }
}

export const SUPPORTED_HOSTS = HOSTS.map((h) => h.label)
