import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { PublicNav } from "@/components/layout/public-nav";
import { Card } from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ created?: string }>;
}) {
  const params = await searchParams;
  const showCreatedMessage = params?.created === "1";

  return (
    <main className="grid min-h-screen place-items-center bg-[var(--bg-main)] px-5 pb-10 pt-32 text-[var(--text-main)]">
      <PublicNav />
      <div className="fixed inset-0 -z-10 bg-[var(--hero-backdrop)]" />
      <Card className="w-full max-w-md">
        <h1 className="text-3xl font-semibold">Welcome back</h1>
        <p className="mt-2 text-sm text-white/55">Log in with your username, matric number, phone number, or email.</p>
        {showCreatedMessage ? (
          <p className="mt-5 rounded-2xl border border-mint/20 bg-mint/10 p-3 text-sm text-mint">
            Account created. Log in first, then complete your onboarding with your department and level.
          </p>
        ) : null}
        <LoginForm />
        <p className="mt-5 text-center text-sm text-white/55">No account? <Link className="text-mint" href="/signup">Create one</Link></p>
      </Card>
    </main>
  );
}
