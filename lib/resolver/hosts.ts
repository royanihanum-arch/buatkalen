import 'server-only'
import { fetchText, readText, safeFetch } from '@/lib/security/safe-fetch'
import { absolute, detectCaptcha, filenameFromDisposition, formFields, load, parseSize } from './html'
import { megaResolver } from './mega'
import type { HostResolver, ResolveContext, ResolverOutcome } from './types'

const err = (host: string, message: string): ResolverOutcome => ({ kind: 'error', host, message })

function captchaOr(host: string, html: string, pageUrl: string): ResolverOutcome | null {
  const c = detectCaptcha(html)
  if (!c) return null
  return {
    kind: 'captcha',
    host,
    provider: c.provider,
    sitekey: c.sitekey,
    pageUrl,
    hint: `${host} requires a human verification before releasing the file.`,
  }
}

async function json<T = any>(url: string, ctx: ResolveContext, init: Parameters<typeof safeFetch>[1] = {}): Promise<T> {
  const { text } = await fetchText(url, { jar: ctx.jar, ...init })
  return JSON.parse(text) as T
}

const pixeldrain: HostResolver = {
  id: 'pixeldrain',
  label: 'Pixeldrain',
  match: /(^|\.)pixeldrain\.(com|net)$/i,
  async resolve(url, ctx) {
    const m = url.pathname.match(/\/(u|l|api\/file)\/(\w+)/)
    if (!m) return err('pixeldrain', 'Unrecognised Pixeldrain link')
    let id = m[2]
    if (m[1] === 'l') {
      const list = await json(`https://pixeldrain.com/api/list/${id}`, ctx)
      id = list.files?.[0]?.id
      if (!id) return err('pixeldrain', 'Album is empty')
      ctx.log(`Pixeldrain · album → ${list.files.length} files, picking first`)
    }
    const info = await json(`https://pixeldrain.com/api/file/${id}/info`, ctx)
    if (info.success === false) return err('pixeldrain', info.message ?? 'File unavailable')
    return { kind: 'file', host: 'pixeldrain', directUrl: `https://pixeldrain.com/api/file/${id}?download`, filename: info.name, size: info.size }
  },
}

const gofile: HostResolver = {
  id: 'gofile',
  label: 'GoFile',
  match: /(^|\.)gofile\.io$/i,
  async resolve(url, ctx) {
    const id = url.pathname.match(/\/d\/(\w+)/)?.[1]
    if (!id) return err('gofile', 'Unrecognised GoFile link')
    const account = await json('https://api.gofile.io/accounts', ctx, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })
    const token = account.data?.token
    if (!token) return err('gofile', 'GoFile refused to issue a guest token')
    const { text: js } = await fetchText('https://gofile.io/dist/js/global.js', { jar: ctx.jar })
    const wt = process.env.GOFILE_WT ?? js.match(/wt\s*[:=]\s*["']([\w]+)["']/)?.[1] ?? '4fd6sg89d7s6'
    ctx.log('GoFile · guest token issued, website token extracted')
    const data = await json(`https://api.gofile.io/contents/${id}?wt=${wt}`, ctx, {
      headers: { authorization: `Bearer ${token}`, 'x-website-token': wt },
    })
    if (data.status !== 'ok') return err('gofile', `GoFile: ${data.status}`)
    let node = data.data
    if (node.type === 'folder') {
      const children = Object.values(node.children ?? {}) as any[]
      node = children.find((c) => c.type === 'file')
      if (!node) return err('gofile', 'Folder has no files')
      ctx.log(`GoFile · folder → ${children.length} entries, picking first file`)
    }
    return {
      kind: 'file',
      host: 'gofile',
      directUrl: node.link,
      filename: node.name,
      size: node.size,
      cookie: `accountToken=${token}`,
      referer: 'https://gofile.io/',
      proxyOnly: true,
    }
  },
}

const mediafire: HostResolver = {
  id: 'mediafire',
  label: 'MediaFire',
  match: /(^|\.)mediafire\.com$/i,
  async resolve(url, ctx) {
    const { text, finalUrl } = await fetchText(url.toString(), { jar: ctx.jar })
    const $ = load(text)
    const button = $('#downloadButton')
    const scrambled = button.attr('data-scrambled-url')
    const href =
      (scrambled ? Buffer.from(scrambled, 'base64').toString('utf8') : null) ??
      button.attr('href') ??
      text.match(/https?:\/\/download\d+\.mediafire\.com\/[^"'\s<>]+/)?.[0]
    const direct = absolute(href, finalUrl)
    if (!direct || !/download\d*\.mediafire\.com/.test(direct)) {
      return captchaOr('mediafire', text, finalUrl) ?? err('mediafire', 'File removed or link is private')
    }
    return {
      kind: 'file',
      host: 'mediafire',
      directUrl: direct,
      filename: $('.dl-btn-label').attr('title') ?? $('div.filename').first().text().trim() ?? undefined,
      size: parseSize(button.text()),
    }
  },
}

const gdrive: HostResolver = {
  id: 'gdrive',
  label: 'Google Drive',
  match: /(^|\.)(drive|docs|drive\.usercontent)\.google\.com$/i,
  async resolve(url, ctx) {
    const id = url.pathname.match(/\/d\/([\w-]{20,})/)?.[1] ?? url.searchParams.get('id')
    if (!id) return err('gdrive', 'Could not find a Google Drive file id')
    const start = `https://drive.usercontent.google.com/download?id=${id}&export=download&authuser=0`
    const { res, finalUrl } = await safeFetch(start, { jar: ctx.jar })
    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('text/html')) {
      await res.body?.cancel()
      return {
        kind: 'file',
        host: 'gdrive',
        directUrl: finalUrl,
        filename: filenameFromDisposition(res.headers.get('content-disposition')),
        size: Number(res.headers.get('content-length')) || undefined,
      }
    }
    const html = await readText(res)
    const $ = load(html)
    const form = $('form#download-form, form[action*="download"]').first()
    if (!form.length) return err('gdrive', 'File is private, removed, or exceeded its download quota')
    const params = formFields($, form)
    const action = absolute(form.attr('action'), finalUrl) ?? 'https://drive.usercontent.google.com/download'
    ctx.log('Google Drive · bypassed large-file virus-scan interstitial')
    const filename = $('span.uc-name-size a').text().trim() || undefined
    return { kind: 'file', host: 'gdrive', directUrl: `${action}?${params}`, filename, size: parseSize($('span.uc-name-size').text()) }
  },
}

const buzzheavier: HostResolver = {
  id: 'buzzheavier',
  label: 'Buzzheavier',
  match: /(^|\.)(buzzheavier|bzzhr|fuckingfast|flashbang)\.(com|co|sh|to)$/i,
  async resolve(url, ctx) {
    const base = `${url.origin}${url.pathname.replace(/\/download\/?$/, '')}`
    const { text } = await fetchText(base, { jar: ctx.jar })
    const name = load(text)('span.text-2xl, h1').first().text().trim() || undefined
    const { res } = await safeFetch(`${base}/download`, {
      jar: ctx.jar,
      followRedirects: false,
      headers: { 'hx-request': 'true', 'hx-current-url': base, referer: base },
    })
    await res.body?.cancel()
    const target = absolute(res.headers.get('hx-redirect') ?? res.headers.get('location'), base)
    if (!target) return err('buzzheavier', 'Buzzheavier did not return a download target')
    return { kind: 'file', host: 'buzzheavier', directUrl: target, filename: name, referer: base }
  },
}

const krakenfiles: HostResolver = {
  id: 'krakenfiles',
  label: 'Krakenfiles',
  match: /(^|\.)krakenfiles\.com$/i,
  async resolve(url, ctx) {
    const { text, finalUrl } = await fetchText(url.toString(), { jar: ctx.jar })
    const $ = load(text)
    const form = $('#dl-form').first()
    const token = $('#dl-token').attr('value') ?? form.find('input[name="token"]').attr('value')
    const action = absolute(form.attr('action'), finalUrl)
    if (!token || !action) return captchaOr('krakenfiles', text, finalUrl) ?? err('krakenfiles', 'Download form not found')
    const data = await json(action, ctx, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', referer: finalUrl, 'x-requested-with': 'XMLHttpRequest' },
      body: new URLSearchParams({ token }).toString(),
    })
    if (!data.url) return err('krakenfiles', 'Krakenfiles did not return a URL')
    return { kind: 'file', host: 'krakenfiles', directUrl: data.url, filename: $('.coin-name h5').text().trim() || undefined, referer: finalUrl }
  },
}

const uploadee: HostResolver = {
  id: 'uploadee',
  label: 'Upload.ee',
  match: /(^|\.)upload\.ee$/i,
  async resolve(url, ctx) {
    const { text, finalUrl } = await fetchText(url.toString(), { jar: ctx.jar })
    const $ = load(text)
    const direct = absolute($('#d_l').attr('href'), finalUrl)
    if (!direct) return err('uploadee', 'File not found')
    return { kind: 'file', host: 'uploadee', directUrl: direct, filename: decodeURIComponent(direct.split('/').pop() ?? '') || undefined }
  },
}

const qiwi: HostResolver = {
  id: 'qiwi',
  label: 'Qiwi',
  match: /(^|\.)qiwi\.gg$/i,
  async resolve(url, ctx) {
    const id = url.pathname.match(/\/(?:file|folder)\/([\w-]+)/)?.[1]
    if (!id) return err('qiwi', 'Unrecognised Qiwi link')
    const { text } = await fetchText(url.toString(), { jar: ctx.jar })
    const name = load(text)('h1').first().text().trim()
    const ext = name.includes('.') ? name.split('.').pop() : ''
    if (!name) return err('qiwi', 'File not found')
    return { kind: 'file', host: 'qiwi', directUrl: `https://spyderrock.com/${id}${ext ? `.${ext}` : ''}`, filename: name }
  },
}

const workupload: HostResolver = {
  id: 'workupload',
  label: 'Workupload',
  match: /(^|\.)workupload\.com$/i,
  async resolve(url, ctx) {
    const id = url.pathname.match(/\/(?:file|start)\/(\w+)/)?.[1]
    if (!id) return err('workupload', 'Unrecognised Workupload link')
    const { text } = await fetchText(`https://workupload.com/file/${id}`, { jar: ctx.jar })
    const gate = captchaOr('workupload', text, `https://workupload.com/file/${id}`)
    if (gate) return gate
    await fetchText(`https://workupload.com/start/${id}`, { jar: ctx.jar })
    const data = await json(`https://workupload.com/api/file/getDownloadServer/${id}`, ctx)
    const direct = data?.data?.url
    if (!direct) return err('workupload', 'Workupload refused the download request')
    return { kind: 'file', host: 'workupload', directUrl: direct, filename: load(text)('.filename p').first().text().trim() || undefined, cookie: ctx.jar.header(), referer: 'https://workupload.com/' }
  },
}

const sfile: HostResolver = {
  id: 'sfile',
  label: 'Sfile',
  match: /(^|\.)sfile\.(mobi|co)$/i,
  async resolve(url, ctx) {
    const { text, finalUrl } = await fetchText(url.toString(), { jar: ctx.jar })
    const $ = load(text)
    const step = absolute($('#download').attr('href') ?? $('a[href*="/download/"]').first().attr('href'), finalUrl)
    if (!step) return captchaOr('sfile', text, finalUrl) ?? err('sfile', 'Download button not found')
    const name = $('h1').first().text().trim() || undefined
    const second = await fetchText(step, { jar: ctx.jar, headers: { referer: finalUrl } })
    const direct =
      absolute(load(second.text)('#download').attr('href'), second.finalUrl) ??
      absolute(second.text.match(/https?:\/\/[^"'\s]+\/downloadfile\/[^"'\s]+/)?.[0], second.finalUrl) ??
      step
    return { kind: 'file', host: 'sfile', directUrl: direct, filename: name, referer: second.finalUrl, cookie: ctx.jar.header(), proxyOnly: true }
  },
}

const modsfire: HostResolver = {
  id: 'modsfire',
  label: 'Modsfire',
  match: /(^|\.)modsfire\.com$/i,
  async resolve(url, ctx) {
    const { text, finalUrl } = await fetchText(url.toString(), { jar: ctx.jar })
    const $ = load(text)
    const href = $('a.download-button, a#download, a[href*="/d/"]').first().attr('href')
    const direct = absolute(href, finalUrl)
    if (!direct) return captchaOr('modsfire', text, finalUrl) ?? err('modsfire', 'Download link not found')
    return { kind: 'file', host: 'modsfire', directUrl: direct, filename: $('h1, .file-name').first().text().trim() || undefined, referer: finalUrl }
  },
}

const fichier: HostResolver = {
  id: '1fichier',
  label: '1fichier',
  match: /(^|\.)(1fichier|alterupload|cjoint|desfichiers|dfichiers|megadl|mesfichiers|piecejointe|pjointe|tenvoi|dl4free)\.(com|net|org|fr)$/i,
  async resolve(url, ctx) {
    const { text, finalUrl } = await fetchText(url.toString(), { jar: ctx.jar })
    const wait = text.match(/You must wait (\d+) minutes?/i)
    if (wait) return err('1fichier', `1fichier free-tier cooldown: wait ${wait[1]} minutes from this IP`)
    const $ = load(text)
    const form = $('form#f1, form[method="post"]').first()
    const gate = captchaOr('1fichier', text, finalUrl)
    if (gate) return gate
    const params = formFields($, form)
    params.set('dl_no_ssl', 'on')
    params.set('dlinline', 'on')
    const second = await fetchText(finalUrl, {
      jar: ctx.jar,
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', referer: finalUrl },
      body: params.toString(),
    })
    const direct = absolute(load(second.text)('a.ok.btn-general, a[href*=".1fichier.com/"]').first().attr('href'), second.finalUrl)
    if (!direct) {
      const w = second.text.match(/wait (\d+) minutes?/i)
      return err('1fichier', w ? `1fichier cooldown: wait ${w[1]} minutes` : '1fichier did not release a link')
    }
    return { kind: 'file', host: '1fichier', directUrl: direct, filename: $('td.normal').first().text().trim() || undefined }
  },
}

const dood: HostResolver = {
  id: 'doodstream',
  label: 'DoodStream',
  match: /(^|\.)(dood|doods|dooood|ds2play|ds2video|d000d|d0000d|do0od|doodstream|vide0|myvidplay|playmogo)\.[a-z]+$/i,
  async resolve(url, ctx) {
    const embed = url.toString().replace(/\/[df]\//, '/e/')
    const { text, finalUrl } = await fetchText(embed, { jar: ctx.jar })
    const pass = text.match(/\/pass_md5\/[\w/-]+/)?.[0]
    if (!pass) return captchaOr('doodstream', text, finalUrl) ?? err('doodstream', 'Video removed or player locked')
    const origin = new URL(finalUrl).origin
    const { text: base } = await fetchText(`${origin}${pass}`, { jar: ctx.jar, headers: { referer: finalUrl } })
    const token = pass.split('/').pop()
    const rand = Array.from({ length: 10 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]).join('')
    const title = load(text)('title').text().replace(/ - DoodStream.*$/i, '').trim()
    ctx.log('DoodStream · pass_md5 handshake complete')
    return {
      kind: 'file',
      host: 'doodstream',
      directUrl: `${base.trim()}${rand}?token=${token}&expiry=${Date.now()}`,
      filename: title ? `${title}.mp4` : undefined,
      referer: `${origin}/`,
      proxyOnly: true,
    }
  },
}

const terabox: HostResolver = {
  id: 'terabox',
  label: 'TeraBox',
  match: /(^|\.)(terabox|1024terabox|teraboxapp|terabox\.app|4funbox|mirrobox|nephobox|momerybox|tibibox|freeterabox|1024tera|teraboxlink|terasharelink|terafileshare)\.(com|app|link|co)$/i,
  async resolve(url, ctx) {
    const surl = url.searchParams.get('surl') ?? url.pathname.match(/\/(?:s|sharing\/link)\/1?([\w-]+)/)?.[1]
    if (!surl) return err('terabox', 'Unrecognised TeraBox link')
    const ndus = process.env.TERABOX_NDUS
    if (!ndus) {
      return {
        kind: 'captcha',
        host: 'terabox',
        provider: 'gate',
        pageUrl: url.toString(),
        hint: 'TeraBox only releases direct links to signed-in sessions. Set TERABOX_NDUS on the server, or verify in the original page.',
      }
    }
    ctx.jar.set('ndus', ndus)
    const { text: page } = await fetchText(`https://www.terabox.com/sharing/link?surl=${surl}`, { jar: ctx.jar })
    const jsToken = decodeURIComponent(page.match(/fn%28%22([0-9A-F]+)%22%29/)?.[1] ?? page.match(/jsToken\s*[:=]\s*["']([^"']+)/)?.[1] ?? '')
    const list = await json(
      `https://www.terabox.com/share/list?app_id=250528&web=1&channel=dubox&clienttype=0&jsToken=${jsToken}&shorturl=${surl}&root=1`,
      ctx,
      { headers: { referer: 'https://www.terabox.com/' } },
    )
    if (list.errno !== 0) return err('terabox', `TeraBox errno ${list.errno} — cookie may be expired`)
    const item = (list.list ?? []).find((f: any) => f.isdir === 0 || f.isdir === '0')
    if (!item?.dlink) return err('terabox', 'No downloadable file in this share')
    return { kind: 'file', host: 'terabox', directUrl: item.dlink, filename: item.server_filename, size: Number(item.size), cookie: `ndus=${ndus}`, referer: 'https://www.terabox.com/', proxyOnly: true }
  },
}

/** XFileSharing-family hosts (Katfile, Filerice, …) share the op=download1/2 form flow. */
function xfs(id: string, label: string, match: RegExp): HostResolver {
  return {
    id,
    label,
    match,
    async resolve(url, ctx) {
      const { text, finalUrl } = await fetchText(url.toString(), { jar: ctx.jar })
      let $ = load(text)
      let html = text
      for (const op of ['download1', 'download2']) {
        const form = $(`form:has(input[name="op"][value="${op}"])`).first()
        if (!form.length) continue
        const gate = captchaOr(id, html, finalUrl)
        if (gate && op === 'download2') return gate
        const params = formFields($, form)
        params.set('method_free', params.get('method_free') || 'Free Download')
        const { res, finalUrl: after } = await safeFetch(absolute(form.attr('action'), finalUrl) ?? finalUrl, {
          jar: ctx.jar,
          method: 'POST',
          followRedirects: false,
          headers: { 'content-type': 'application/x-www-form-urlencoded', referer: finalUrl },
          body: params.toString(),
        })
        const loc = res.headers.get('location')
        if (loc) {
          await res.body?.cancel()
          return { kind: 'file', host: id, directUrl: new URL(loc, after).toString(), referer: finalUrl }
        }
        html = await readText(res)
        $ = load(html)
        ctx.log(`${label} · submitted ${op}`)
      }
      const direct = $('a[href*="/d/"], a#direct_link, a.btn-download, span#direct_link a').first().attr('href')
      const target = absolute(direct, finalUrl)
      if (target) return { kind: 'file', host: id, directUrl: target, referer: finalUrl, filename: $('h2, .name').first().text().trim() || undefined }
      return captchaOr(id, html, finalUrl) ?? err(id, `${label} did not release a link (countdown or premium only)`)
    },
  }
}

const rapidgator: HostResolver = {
  id: 'rapidgator',
  label: 'Rapidgator',
  match: /(^|\.)(rapidgator\.net|rg\.to)$/i,
  async resolve(url, ctx) {
    const { text, finalUrl } = await fetchText(url.toString(), { jar: ctx.jar })
    if (/File not found/i.test(text)) return err('rapidgator', 'File not found')
    const name = load(text)('.filename, title').first().text().replace(/download file/i, '').trim()
    return {
      kind: 'captcha',
      host: 'rapidgator',
      provider: detectCaptcha(text)?.provider ?? 'gate',
      pageUrl: finalUrl,
      hint: `Rapidgator gates every free download behind a countdown and captcha${name ? ` for "${name}"` : ''}.`,
    }
  },
}

export const HOSTS: HostResolver[] = [
  megaResolver,
  pixeldrain,
  gofile,
  mediafire,
  gdrive,
  buzzheavier,
  krakenfiles,
  uploadee,
  qiwi,
  workupload,
  sfile,
  modsfire,
  fichier,
  dood,
  terabox,
  rapidgator,
  xfs('katfile', 'Katfile', /(^|\.)katfile\.(com|cloud)$/i),
  xfs('filerice', 'Filerice', /(^|\.)filerice\.com$/i),
  xfs('anonfiles', 'AnonFiles mirrors', /(^|\.)(anonfiles|anonfile|anonymfile|bayfiles)\.(com|me|la|to)$/i),
]

export function findHost(url: URL): HostResolver | undefined {
  return HOSTS.find((h) => h.match.test(url.hostname))
}
