"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    router.prefetch("/login");
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

    const { data, error: authError } = await supabase.auth.signUp({
      email: String(formData.get("email") || ""),
      password: String(formData.get("password") || ""),
      options: {
        data: {
          name: String(formData.get("name") || ""),
          username: String(formData.get("username") || "").trim().toLowerCase(),
          preferred_language: "en",
        },
      },
    });
    setLoading(false);
    if (authError) {
      setError(authError.message);
      return;
    }

    if (data.session?.access_token) {
      try {
        await createProfileBootstrap(data.session.access_token);
      } catch {
        // Avoid blocking account creation if the profile bootstrap fails here.
      }
    }

    // Keep signup and first login as separate steps, even when Supabase creates a session immediately.
    await supabase.auth.signOut();
    router.push("/login?created=1");
  }

  return (
    <form action={handleSubmit} className="mt-8 space-y-4">
      <input name="name" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none" placeholder="Full name" required />
      <input name="username" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none" placeholder="Username" required />
      <input name="email" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none" placeholder="Email" type="email" required />
      <input name="password" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none" placeholder="Password" type="password" required />
      {error && <p className="rounded-2xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      <Button className="w-full" disabled={loading}>{loading ? "Creating..." : "Sign up"}</Button>
    </form>
  );
}

async function createProfileBootstrap(token: string) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/auth/bootstrap-user`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Could not create user profile.");
  }
}
