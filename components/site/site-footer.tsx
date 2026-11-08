import Link from 'next/link'

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '/resolve', label: 'Resolve' },
      { href: '/#hosts', label: 'Hosts' },
    ],
  },
  {
    title: 'Trust',
    links: [
      { href: '/#security', label: 'Security' },
      { href: '/#usage', label: 'Fair use' },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="relative w-full bg-[#181818] p-6 md:p-8">
      <div className="mb-14 mt-6 flex flex-col gap-10 md:mb-40 md:mt-8 md:flex-row md:gap-[120px]">
        {COLUMNS.map((col) => (
          <div key={col.title} className="flex flex-col gap-2">
            <p className="text-[26px] font-medium leading-normal text-white/50 md:text-[32px]">{col.title}</p>
            <ul className="flex flex-col text-[26px] font-medium leading-normal text-white md:text-[32px]">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-opacity hover:opacity-60">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 text-[12px] text-white/50 md:flex-row md:items-center md:justify-between">
        <p>{'© 2026 unwrap. Resolve only files you have the right to download.'}</p>
        <p className="font-mono">{'TLS 1.3 · AES-256-GCM tickets · SSRF-pinned egress'}</p>
      </div>
    </footer>
  )
}
