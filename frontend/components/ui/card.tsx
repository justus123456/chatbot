import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[2rem] border border-[var(--border-soft)] bg-[var(--panel)] p-6 text-[var(--text-main)] shadow-glass backdrop-blur-2xl",
        className,
      )}
      {...props}
    />
  );
}
