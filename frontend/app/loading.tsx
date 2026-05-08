export default function RootLoading() {
  return (
    <main className="min-h-screen app-surface">
      <div className="app-bg fixed inset-0 -z-10" />
      <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-5">
        <div className="w-full max-w-xl rounded-[32px] border border-[var(--border-soft)] bg-[var(--panel)] p-8 text-center shadow-glass backdrop-blur-2xl">
          <div className="mx-auto mb-5 size-12 animate-pulse rounded-full bg-[var(--accent-soft)]" />
          <p className="text-sm uppercase tracking-[0.3em] text-[var(--accent)]">Opening SmartCampus</p>
          <h1 className="mt-3 text-2xl font-semibold text-[var(--text-main)]">Loading your workspace...</h1>
          <p className="mt-3 text-sm text-[var(--text-muted)]">The first visit can be slower in development while Next.js compiles the route.</p>
        </div>
      </div>
    </main>
  );
}
