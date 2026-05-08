import Link from "next/link";
import { SignupForm } from "@/components/auth/signup-form";
import { PublicNav } from "@/components/layout/public-nav";
import { Card } from "@/components/ui/card";

export default function SignupPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--bg-main)] px-5 pb-10 pt-32 text-[var(--text-main)]">
      <PublicNav />
      <div className="fixed inset-0 -z-10 bg-[var(--hero-backdrop)]" />
      <Card className="w-full max-w-md">
        <h1 className="text-3xl font-semibold">Create your account</h1>
        <p className="mt-2 text-sm text-white/55">Create your login with a username, then complete your department and level profile for personalized updates.</p>
        <SignupForm />
        <p className="mt-5 text-center text-sm text-white/55">Already registered? <Link className="text-mint" href="/login">Log in</Link></p>
      </Card>
    </main>
  );
}
