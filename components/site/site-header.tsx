'use client'

import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/resolve', label: 'Resolve a link' },
  { href: '/#hosts', label: 'Supported hosts' },
  { href: '/#security', label: 'Security' },
]

export function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.4px] text-white">
      <span aria-hidden="true" className="relative flex size-4 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-[2px] border-white" />
        <span className="size-1.5 rounded-full bg-[#98EAFF]" />
      </span>
      unwrap
    </span>
  )
}

export function SiteHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header
      className={cn(
        'fixed left-1/2 top-8 z-[1001] flex w-[90%] -translate-x-1/2 flex-col items-center overflow-hidden rounded-[28px] bg-[#29292980] px-6 backdrop-blur-[12px] transition-[height] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] md:top-5 md:w-[438px]',
        open ? 'h-[262px]' : 'h-[46px]',
      )}
    >
      <div className="flex h-[46px] w-full shrink-0 items-center justify-between">
        <Link href="/" aria-label="unwrap home" onClick={() => setOpen(false)}>
          <Wordmark />
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
          className="relative flex size-8 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
        >
          <span className={cn('absolute h-[1.5px] w-4 bg-current transition-transform duration-300', open ? 'rotate-45' : '-translate-y-[3px]')} />
          <span className={cn('absolute h-[1.5px] w-4 bg-current transition-transform duration-300', open ? '-rotate-45' : 'translate-y-[3px]')} />
        </button>
      </div>
      <nav id="site-menu" aria-label="Main" className={cn('flex w-full flex-col pb-5 pt-2 transition-opacity duration-300', open ? 'opacity-100' : 'pointer-events-none opacity-0')}>
        {NAV.map((item, i) => (
          <Link
            key={item.href}
            href={item.href}
            tabIndex={open ? 0 : -1}
            onClick={() => setOpen(false)}
            style={{ transitionDelay: open ? `${80 + i * 45}ms` : '0ms' }}
            className={cn(
              'py-2 text-[26px] font-medium leading-tight tracking-[-0.6px] text-white/50 transition-all duration-500 hover:text-white',
              open ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}
