import type { CookieJar } from '@/lib/security/safe-fetch'

export type CaptchaProvider = 'recaptcha' | 'hcaptcha' | 'turnstile' | 'cloudflare' | 'gate'

export interface FileResult {
  kind: 'file'
  host: string
  directUrl: string
  filename?: string
  size?: number
  /** Upstream requires these; forces streaming through the sealed proxy. */
  referer?: string
  cookie?: string
  mega?: { key: string; iv: string }
  proxyOnly?: boolean
}

export interface CaptchaResult {
  kind: 'captcha'
  host: string
  provider: CaptchaProvider
  sitekey?: string
  pageUrl: string
  hint: string
}

export interface ErrorResult {
  kind: 'error'
  host: string
  message: string
}

export interface NextResult {
  kind: 'next'
  url: string
}

export type ResolverOutcome = FileResult | CaptchaResult | ErrorResult | NextResult

export interface ResolveContext {
  log: (message: string) => void
  jar: CookieJar
}

export interface HostResolver {
  id: string
  label: string
  match: RegExp
  resolve: (url: URL, ctx: ResolveContext) => Promise<ResolverOutcome>
}

export interface PublicResult {
  status: 'ok' | 'captcha' | 'error'
  host: string
  steps: string[]
  filename?: string
  size?: number
  downloadUrl?: string
  directUrl?: string
  provider?: CaptchaProvider
  sitekey?: string
  pageUrl?: string
  message?: string
  elapsedMs: number
}
