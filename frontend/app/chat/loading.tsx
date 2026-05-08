export default function ChatLoading() {
  return (
    <main className="min-h-screen app-surface p-4 md:p-8">
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="h-[70vh] rounded-[32px] border border-[var(--border-soft)] bg-[var(--panel)]" />
        <div className="h-[70vh] rounded-[32px] border border-[var(--border-soft)] bg-[var(--panel)]" />
      </div>
    </main>
  );
}
