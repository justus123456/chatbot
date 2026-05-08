export default function DashboardLoading() {
  return (
    <main className="min-h-screen app-surface p-4 md:p-8">
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <div className="hidden rounded-[30px] border border-[var(--border-soft)] bg-[var(--panel)] p-5 lg:block" />
        <div className="space-y-5">
          <div className="h-16 rounded-full border border-[var(--border-soft)] bg-[var(--panel)]" />
          <div className="grid gap-5 lg:grid-cols-[1.5fr_0.9fr]">
            <div className="h-64 rounded-[32px] border border-[var(--border-soft)] bg-[var(--panel)]" />
            <div className="h-64 rounded-[32px] border border-[var(--border-soft)] bg-[var(--panel)]" />
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            <div className="h-36 rounded-[32px] border border-[var(--border-soft)] bg-[var(--panel)]" />
            <div className="h-36 rounded-[32px] border border-[var(--border-soft)] bg-[var(--panel)]" />
            <div className="h-36 rounded-[32px] border border-[var(--border-soft)] bg-[var(--panel)]" />
          </div>
        </div>
      </div>
    </main>
  );
}
