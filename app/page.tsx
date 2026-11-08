import Link from 'next/link'
import { MotionBackground } from '@/components/site/motion-background'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'
import { TypedHeadline } from '@/components/site/typed-headline'
import { GlassSection } from '@/components/site/glass-section'

const PHRASES = [
  'one link in. the real file out.',
  'shortlinks, redirectors and protectors — unwrapped.',
  'from mediafire, mega, drive and more. instantly.',
]

const HOSTS = [
  'MediaFire', 'Google Drive', 'Mega', 'Pixeldrain', 'GoFile', 'Sfile', 'Modsfire', 'TeraBox', 'Buzzheavier',
  'Krakenfiles', 'Upload.ee', 'Qiwi', 'Workupload', 'Katfile', 'Filerice', 'DoodStream', '1fichier', 'Rapidgator',
  'AnonFiles mirrors', 'any redirector',
]

const SECURITY = [
  ['SSRF-pinned egress', 'Every hop is DNS-resolved and checked against private, loopback, link-local and metadata ranges before the socket opens.'],
  ['Sealed tickets', 'Download links are AES-256-GCM sealed, short-lived and bound to the server secret — no open proxy.'],
  ['Origin + rate guard', 'Same-origin enforcement, token-bucket rate limits per client, and strict payload caps.'],
  ['Hardened headers', 'HSTS, CSP, COOP/CORP, frame and permissions policies applied to every response.'],
]

export default function Home() {
  return (
    <>
      <MotionBackground />
      <SiteHeader />
      <main className="relative flex flex-col items-center">
        <section className="flex h-svh w-full flex-col items-center justify-center gap-10">
          <span className="rise rounded-full border border-white/15 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-white/70">beta</span>
          <div className="rise [animation-delay:150ms]">
            <TypedHeadline phrases={PHRASES} />
          </div>
          <Link
            href="/resolve"
            className="rise group flex h-12 items-center gap-2 rounded-full bg-white px-7 text-[17px] font-medium tracking-[-0.3px] text-black transition-transform [animation-delay:300ms] hover:scale-[1.03] active:scale-[0.98]"
          >
            start
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
              {'→'}
            </span>
          </Link>
        </section>

        <GlassSection id="usage">
          <h2 className="text-[26px] font-medium leading-[1.25] tracking-[-0.6px] text-white/50 md:text-[32px]">
            <span className="text-white">unwrap peels back</span> every shortlink, redirector and link protector, then talks to the file host
            directly to hand you the real download.{' '}
            <Link href="/resolve" className="dotted-link text-white">
              start now
            </Link>
          </h2>
        </GlassSection>

        <GlassSection id="hosts">
          <p className="mb-6 font-mono text-[12px] uppercase tracking-[0.2em] text-white/50">native resolvers</p>
          <ul className="flex flex-wrap gap-2">
            {HOSTS.map((h) => (
              <li key={h} className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[15px] text-white/85">
                {h}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[15px] leading-relaxed text-white/50">
            When a host demands a CAPTCHA or countdown, unwrap stops and shows it to you — you click it, then the chain continues.
          </p>
        </GlassSection>

        <GlassSection id="security">
          <p className="mb-6 font-mono text-[12px] uppercase tracking-[0.2em] text-white/50">security, 2026</p>
          <dl className="flex flex-col gap-5">
            {SECURITY.map(([t, d]) => (
              <div key={t}>
                <dt className="text-[20px] font-medium tracking-[-0.4px] text-white">{t}</dt>
                <dd className="mt-1 text-[15px] leading-relaxed text-white/55">{d}</dd>
              </div>
            ))}
          </dl>
        </GlassSection>

        <div className="h-[20vh]" />
        <SiteFooter />
      </main>
    </>
  )
}
