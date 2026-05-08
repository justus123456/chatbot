export default function SignupLoading() {
  return (
    <main className="grid min-h-screen place-items-center app-surface p-5">
      <div className="w-full max-w-md rounded-[32px] border border-[var(--border-soft)] bg-[var(--panel)] p-8 shadow-glass">
        <div className="h-8 w-48 rounded-full bg-[var(--panel-strong)]" />
        <div className="mt-4 h-4 w-72 rounded-full bg-[var(--panel-strong)]" />
        <div className="mt-8 space-y-4">
          <div className="h-12 rounded-2xl bg-[var(--panel-strong)]" />
          <div className="h-12 rounded-2xl bg-[var(--panel-strong)]" />
          <div className="h-12 rounded-2xl bg-[var(--panel-strong)]" />
          <div className="h-12 rounded-2xl bg-[var(--panel-strong)]" />
          <div className="h-12 rounded-full bg-[var(--accent-soft)]" />
        </div>
      </div>
    </main>
  );
}
