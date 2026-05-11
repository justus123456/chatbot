"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/flask-client";
import { getRoleHome } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    router.prefetch("/dashboard");
    router.prefetch("/admin");
    router.prefetch("/lecturer");
    router.prefetch("/dean");
    router.prefetch("/complete-profile");
  }, [router]);

  async function handleSubmit(formData: FormData) {
    setError("");
    setLoading(true);
    let supabase;

    try {
      supabase = createClient();
    } catch (caught) {
      setLoading(false);
      setError(caught instanceof Error ? caught.message : "Supabase is not configured yet.");
      return;
    }

    const identifier = String(formData.get("identifier") || "").trim();
    let email = identifier;

    if (!identifier.includes("@")) {
      try {
        const resolved = await apiFetch<{ email: string }>("/api/auth/resolve-identifier", undefined, {
          method: "POST",
          body: JSON.stringify({ identifier }),
        });
        email = resolved.email;
      } catch (caught) {
        setLoading(false);
        setError(caught instanceof Error ? caught.message : "Could not find that account.");
        return;
      }
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: String(formData.get("password") || ""),
    });
    if (authError) {
      setLoading(false);
      setError(authError.message);
      return;
    }

    const { data } = await supabase.auth.getSession();

    try {
      const result = await apiFetch<{ profile: { is_profile_complete?: boolean; role?: string } }>("/api/auth/bootstrap-user", data.session?.access_token, {
        method: "POST",
      });
      setLoading(false);
      router.push(getRoleHome(result.profile?.role, Boolean(result.profile?.is_profile_complete)));
    } catch (caught) {
      setLoading(false);
      setError(caught instanceof Error ? caught.message : "Could not prepare your student profile.");
      return;
    }

    router.refresh();
  }

  return (
    <form action={handleSubmit} className="mt-8 space-y-4">
      <input name="identifier" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none" placeholder="Username, matric number, phone, or email" required />
      <input name="password" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none" placeholder="Password" type="password" required />
      {error && <p className="rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      <Button className="w-full" disabled={loading}>{loading ? "Signing in..." : "Log in"}</Button>
    </form>
  );
}
