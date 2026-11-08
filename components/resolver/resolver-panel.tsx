'use client'

import { useState } from 'react'
import useSWRMutation from 'swr/mutation'
import type { PublicResult } from '@/lib/resolver/types'
import { ResultCard } from './result-card'

async function resolve(_key: string, { arg }: { arg: string }): Promise<PublicResult> {
  const res = await fetch('/api/resolve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: arg }),
  })
  const data = (await res.json().catch(() => null)) as PublicResult | null
  return data ?? { status: 'error', host: 'unwrap', message: `Request failed (${res.status})`, steps: [], elapsedMs: 0 }
}

export function ResolverPanel() {
  const [url, setUrl] = useState('')
  const { trigger, data, isMutating, reset } = useSWRMutation('resolve', resolve)

  const submit = () => {
    const value = url.trim()
    if (!value || isMutating) return
    trigger(value)
  }

  return (
    <div className="flex w-full max-w-[560px] flex-col items-center gap-8">
      <h1 className="rise text-center text-[26px] font-medium tracking-[-0.78px] md:text-[39px] md:tracking-[-1.17px]">
        {isMutating ? 'unwrapping…' : 'paste a link.'}
      </h1>

      <form
        className="rise glass-card flex w-full items-center gap-2 rounded-full p-1.5 pl-5 [animation-delay:120ms] focus-within:ring-1 focus-within:ring-white/30"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label htmlFor="link" className="sr-only">
          Link to resolve
        </label>
        <input
          id="link"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          required
          maxLength={2048}
          placeholder="https://mediafire.com/file/…"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            if (data) reset()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault()
          }}
          className="h-11 min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-white/35"
        />
        <button
          type="submit"
          disabled={isMutating || !url.trim()}
          className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-white px-5 text-[15px] font-medium text-black transition-all hover:scale-[1.03] active:scale-[0.97] disabled:scale-100 disabled:opacity-40"
        >
          {isMutating ? <span className="size-4 animate-spin rounded-full border-2 border-black/20 border-t-black" aria-hidden="true" /> : null}
          {isMutating ? 'working' : 'unwrap'}
        </button>
      </form>

      <div aria-live="polite" className="w-full">
        {data ? (
          <ResultCard
            key={data.pageUrl ?? data.downloadUrl ?? data.host}
            result={data}
            onRetry={submit}
            onResolveUrl={(next) => {
              setUrl(next)
              trigger(next)
            }}
          />
        ) : null}
      </div>

      {!data && !isMutating ? (
        <p className="rise max-w-[420px] text-center text-[14px] leading-relaxed text-white/45 [animation-delay:240ms]">
          Works with shortlinks, redirectors, link protectors and 19+ file hosts. Only resolve files you have the right to download.
        </p>
      ) : null}
    </div>
  )
}
