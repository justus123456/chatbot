export default function DocumentsLoading() {
  return (
    <main className="min-h-screen app-surface p-4 md:p-8">
      <div className="mx-auto max-w-4xl rounded-[32px] border border-[var(--border-soft)] bg-[var(--panel)] p-6 shadow-glass">
        <div className="h-8 w-56 rounded-full bg-[var(--panel-strong)]" />
        <div className="mt-4 h-4 w-80 rounded-full bg-[var(--panel-strong)]" />
        <div className="mt-8 grid gap-4">
          <div className="h-12 rounded-2xl bg-[var(--panel-strong)]" />
          <div className="h-12 rounded-2xl bg-[var(--panel-strong)]" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-12 rounded-2xl bg-[var(--panel-strong)]" />
            <div className="h-12 rounded-2xl bg-[var(--panel-strong)]" />
          </div>
          <div className="h-28 rounded-2xl bg-[var(--panel-strong)]" />
          <div className="h-12 rounded-full bg-[var(--accent-soft)]" />
        </div>
      </div>
    </main>
  );
}
