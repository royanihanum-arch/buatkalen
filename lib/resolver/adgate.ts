import 'server-only'
import { readText, safeFetch } from '@/lib/security/safe-fetch'
import { load } from './html'
import type { ResolveContext } from './types'

/** Ad-gated shortlink networks that require a real browser session (JS timers, Cloudflare, captchas). */
export const AD_GATE_HOSTS =
  /(^|\.)(sfl\.gl|safelinku\.(com|net)|ouo\.(io|press)|linkvertise\.(com|net)|link-to\.net|link-center\.net|link-target\.net|direct-link\.net|file-link\.net|up-to-down\.net|shrinkme\.(io|us|ink)|shrinkearn\.com|exe\.io|exey\.io|fc\.lc|fc-lc\.(com|xyz)|adf\.ly|shorte\.st|sh\.st|gplinks\.(co|in)|droplink\.co|cuty\.io|cutty\.app|lootlinks\.co|loot-link\.com|lootdest\.(org|info)|work\.ink|boost\.ink|sub2unlock\.(com|net)|rekonise\.com|mboost\.me|tii\.la|oii\.io|earnow\.online|za\.gl|clk\.sh|clk\.wiki|shrtfly\.com|stfly\.(me|xyz)|linkpays\.in|adshrink\.it|shortzon\.com|urlcash\.(com|net)|shortlinkto\.biz|wordcounter\.icu|tinyurl\.mobi|semawur\.com|safelink\.(asia|id))$/i

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * AdLinkFly is the engine behind most "earn per click" shorteners. Its final step is a
 * hidden form posted to /links/go that returns the destination as JSON after a countdown.
 */
export async function tryAdLinkFly(html: string, pageUrl: string, ctx: ResolveContext): Promise<string | null> {
  if (!/ad_form_data|links\/go|go-link/i.test(html)) return null
  const $ = load(html)
  const form = $('form#go-link, form[action*="links/go"]').first()
  if (!form.length) return null

  const fields = new URLSearchParams()
  form.find('input[name]').each((_, el) => {
    fields.set($(el).attr('name') as string, $(el).attr('value') ?? '')
  })
  const action = new URL(form.attr('action') || '/links/go', pageUrl).toString()

  const timer = Number(html.match(/(?:counter|timer|seconds)["']?\s*[:=]\s*["']?(\d{1,2})/i)?.[1] ?? 5)
  const wait = Math.min(Math.max(timer, 1), 12)
  ctx.log(`AdLinkFly gate · waiting ${wait}s countdown`)
  await sleep(wait * 1000)

  const { res } = await safeFetch(action, {
    method: 'POST',
    jar: ctx.jar,
    body: fields.toString(),
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      accept: 'application/json, text/javascript, */*; q=0.01',
      referer: pageUrl,
      origin: new URL(pageUrl).origin,
    },
  })
  const text = await readText(res)
  try {
    const json = JSON.parse(text) as { status?: string; url?: string }
    if (json.url && /^https?:\/\//i.test(json.url)) {
      ctx.log('AdLinkFly gate bypassed')
      return json.url
    }
  } catch {
    /* not JSON — gate needs a captcha */
  }
  return null
}
