import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center app-surface px-5 text-center">
      <div className="w-full max-w-xl rounded-[32px] border border-[var(--border-soft)] bg-[var(--panel)] p-8 shadow-glass backdrop-blur-2xl">
        <p className="text-sm uppercase tracking-[0.3em] text-[var(--accent)]">Page not found</p>
        <h1 className="mt-4 text-4xl font-semibold text-[var(--text-main)]">This page does not exist.</h1>
        <p className="mt-4 text-[var(--text-muted)]">
          The link may be old, or the page may still be under construction in this fresh build.
        </p>
        <div className="mt-8 flex justify-center">
          <Button href="/" variant="outline">
            <ArrowLeft className="size-4" />
            Back home
          </Button>
        </div>
      </div>
    </main>
  );
}
