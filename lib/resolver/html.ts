import 'server-only'
import * as cheerio from 'cheerio'
import type { CaptchaProvider } from './types'

export function load(html: string) {
  return cheerio.load(html)
}

export function absolute(href: string | undefined | null, base: string): string | null {
  if (!href) return null
  try {
    const u = new URL(href.trim(), base)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

export function formFields($: cheerio.CheerioAPI, form: ReturnType<cheerio.CheerioAPI>): URLSearchParams {
  const params = new URLSearchParams()
  form.find('input, select, textarea').each((_, el) => {
    const node = $(el)
    const name = node.attr('name')
    const type = (node.attr('type') ?? '').toLowerCase()
    if (!name || type === 'checkbox' || type === 'radio') return
    params.set(name, node.attr('value') ?? node.val()?.toString() ?? '')
  })
  return params
}

export function detectCaptcha(html: string): { provider: CaptchaProvider; sitekey?: string } | null {
  const sitekey =
    html.match(/data-sitekey=["']([\w-]{20,})["']/i)?.[1] ?? html.match(/sitekey["']?\s*[:=]\s*["']([\w-]{20,})["']/i)?.[1]
  if (/challenges\.cloudflare\.com\/turnstile|cf-turnstile/i.test(html)) return { provider: 'turnstile', sitekey }
  if (/hcaptcha\.com\/1\/api\.js|class=["'][^"']*h-captcha/i.test(html)) return { provider: 'hcaptcha', sitekey }
  if (/google\.com\/recaptcha|recaptcha\/api\.js|class=["'][^"']*g-recaptcha/i.test(html)) return { provider: 'recaptcha', sitekey }
  if (/cf_chl_opt|<title>Just a moment\.\.\.<\/title>|cf-browser-verification/i.test(html)) return { provider: 'cloudflare' }
  return null
}

const JS_REDIRECTS = [
  /(?:window|document|top|self)?\.?location(?:\.href)?\s*=\s*["'`]([^"'`]+)["'`]/i,
  /location\.(?:replace|assign)\(\s*["'`]([^"'`]+)["'`]\s*\)/i,
  /window\.open\(\s*["'`](https?:[^"'`]+)["'`]/i,
]

export function findInPageRedirect(html: string, base: string): string | null {
  const $ = load(html)
  const meta = $('meta[http-equiv="refresh" i]').attr('content')
  const metaUrl = meta?.match(/url\s*=\s*['"]?([^'";]+)/i)?.[1]
  if (metaUrl) return absolute(metaUrl, base)
  for (const re of JS_REDIRECTS) {
    const m = html.match(re)
    if (m) {
      const target = absolute(m[1].replace(/\\\//g, '/'), base)
      if (target && target !== base) return target
    }
  }
  return null
}

export function decodeMaybeBase64Url(value: string): string | null {
  const v = value.trim()
  if (/^https?:\/\//i.test(v)) return v
  if (!/^[A-Za-z0-9+/_=-]{12,}$/.test(v)) return null
  try {
    const decoded = Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return /^https?:\/\/[^\s]+$/i.test(decoded) ? decoded : null
  } catch {
    return null
  }
}

export function filenameFromDisposition(header: string | null): string | undefined {
  if (!header) return undefined
  const star = header.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i)?.[1]
  if (star) {
    try {
      return decodeURIComponent(star.replace(/["']/g, ''))
    } catch {}
  }
  return header.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1]
}

export function parseSize(text: string | undefined | null): number | undefined {
  if (!text) return undefined
  const m = text.match(/([\d.,]+)\s*(B|KB|MB|GB|TB)\b/i)
  if (!m) return undefined
  const units: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }
  return Math.round(parseFloat(m[1].replace(',', '.')) * units[m[2].toUpperCase()])
}
