import type { Metadata } from 'next'
import { ResolverPanel } from '@/components/resolver/resolver-panel'
import { MotionBackground } from '@/components/site/motion-background'
import { SiteHeader } from '@/components/site/site-header'

export const metadata: Metadata = {
  title: 'Resolve a link — unwrap',
  description: 'Paste any shortlink or file-host URL to extract the direct download link.',
}

export default function ResolvePage() {
  return (
    <>
      <MotionBackground />
      <SiteHeader />
      <main className="flex min-h-svh w-full flex-col items-center justify-center px-4 pb-16 pt-32">
        <ResolverPanel />
      </main>
    </>
  )
}
