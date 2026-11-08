'use client'

import { useState } from 'react'
import type { PublicResult } from '@/lib/resolver/types'
import { cn } from '@/lib/utils'

function formatBytes(n?: number) {
  if (!n) return null
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`
}

const PROVIDER_LABEL: Record<string, string> = {
  recaptcha: 'Google reCAPTCHA',
  hcaptcha: 'hCaptcha',
  turnstile: 'Cloudflare Turnstile',
  cloudflare: 'Cloudflare challenge',
  gate: 'Countdown / verification gate',
}

export function ResultCard({ result, onRetry }: { result: PublicResult; onRetry: () => void }) {
  const [copied, setCopied] = useState(false)
  const [visited, setVisited] = useState(false)
  const copyTarget = result.directUrl ?? (result.downloadUrl ? new URL(result.downloadUrl, location.origin).toString() : '')

  return (
    <div className="rise glass-card w-full overflow-hidden rounded-[28px]">
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">{result.host}</span>
        <span
          className={cn(
            'flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em]',
            result.status === 'ok' ? 'text-[#98EAFF]' : result.status === 'captcha' ? 'text-amber-200' : 'text-red-300',
          )}
        >
          <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
          {result.status === 'ok' ? 'resolved' : result.status === 'captcha' ? 'verify' : 'failed'} · {(result.elapsedMs / 1000).toFixed(1)}s
        </span>
      </div>

      <div className="flex flex-col gap-5 p-6">
        {result.status === 'ok' ? (
          <>
            <div>
              <p className="break-all text-[20px] font-medium leading-snug tracking-[-0.4px]">{result.filename ?? 'Direct file'}</p>
              {formatBytes(result.size) ? <p className="mt-1 text-[14px] text-white/50">{formatBytes(result.size)}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={result.downloadUrl} className="flex h-11 items-center rounded-full bg-white px-6 text-[15px] font-medium text-black transition-transform hover:scale-[1.03]">
                download
              </a>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(copyTarget)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1600)
                }}
                className="flex h-11 items-center rounded-full border border-white/15 px-6 text-[15px] text-white transition-colors hover:bg-white/10"
              >
                {copied ? 'copied' : result.directUrl ? 'copy direct link' : 'copy link'}
              </button>
            </div>
          </>
        ) : null}

        {result.status === 'captcha' ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-4 rounded-2xl border border-white/10 bg-black/30 p-4">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-white/40" aria-hidden="true" />
              <div>
                <p className="text-[16px] font-medium">{PROVIDER_LABEL[result.provider ?? 'gate']}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-white/55">{result.message}</p>
              </div>
            </div>
            <p className="text-[13px] leading-relaxed text-white/45">
              Captchas are bound to the host&apos;s own domain, so they can only be solved there. Open it, complete the check, then come back and retry.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={result.pageUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                onClick={() => setVisited(true)}
                className="flex h-11 items-center rounded-full bg-white px-6 text-[15px] font-medium text-black transition-transform hover:scale-[1.03]"
              >
                open verification
              </a>
              <button
                type="button"
                onClick={onRetry}
                className={cn('flex h-11 items-center rounded-full border px-6 text-[15px] transition-colors hover:bg-white/10', visited ? 'border-white/40 text-white' : 'border-white/15 text-white/70')}
              >
                {"i've verified — retry"}
              </button>
            </div>
          </div>
        ) : null}

        {result.status === 'error' ? <p className="text-[16px] leading-relaxed text-white/80">{result.message}</p> : null}

        {result.steps.length ? (
          <details className="group">
            <summary className="cursor-pointer list-none font-mono text-[11px] uppercase tracking-[0.2em] text-white/45 hover:text-white/70">
              <span className="inline-block transition-transform group-open:rotate-90" aria-hidden="true">
                {'›'}
              </span>{' '}
              {result.steps.length} hops
            </summary>
            <ol className="mt-3 flex flex-col gap-1.5 border-l border-white/10 pl-4">
              {result.steps.map((s, i) => (
                <li key={i} className="font-mono text-[12px] text-white/60">
                  {s}
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>
    </div>
  )
}
