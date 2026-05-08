export default function CompleteProfileLoading() {
  return (
    <main className="min-h-screen app-surface p-4 md:p-8">
      <div className="mx-auto max-w-6xl rounded-[32px] border border-[var(--border-soft)] bg-[var(--panel)] p-6 shadow-glass">
        <div className="h-4 w-48 rounded-full bg-[var(--accent-soft)]" />
        <div className="mt-4 h-10 w-96 rounded-full bg-[var(--panel-strong)]" />
        <div className="mt-4 h-4 w-full max-w-3xl rounded-full bg-[var(--panel-strong)]" />
        <div className="mt-8 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="h-[420px] rounded-[28px] border border-[var(--border-soft)] bg-[var(--panel-strong)]" />
          <div className="space-y-4">
            <div className="h-48 rounded-[30px] border border-[var(--border-soft)] bg-[var(--panel-strong)]" />
            <div className="h-44 rounded-[30px] border border-[var(--border-soft)] bg-[var(--panel-strong)]" />
            <div className="h-56 rounded-[30px] border border-[var(--border-soft)] bg-[var(--panel-strong)]" />
          </div>
        </div>
      </div>
    </main>
  );
}
