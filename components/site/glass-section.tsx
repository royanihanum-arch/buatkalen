export function GlassSection({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex min-h-[80svh] w-full scroll-mt-24 items-center justify-center px-4 py-16">
      <div className="glass-card w-full max-w-[438px] rounded-[28px] p-7 md:p-8">{children}</div>
    </section>
  )
}
