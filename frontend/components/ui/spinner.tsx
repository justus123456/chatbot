import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-6 animate-spin rounded-full border-2 border-mint border-t-transparent", className)} />;
}
