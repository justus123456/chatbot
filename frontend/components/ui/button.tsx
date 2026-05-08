import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  href?: string;
  variant?: "primary" | "ghost" | "outline";
};

export function Button({ className, variant = "primary", href, children, ...props }: ButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition duration-300",
    variant === "primary" && "bg-[var(--accent)] text-[#03110b] shadow-glow hover:scale-[1.02]",
    variant === "ghost" && "text-[var(--text-muted)] hover:bg-[var(--panel)] hover:text-[var(--text-main)]",
    variant === "outline" && "border border-[var(--border-soft)] bg-[var(--panel)] text-[var(--text-main)] hover:bg-[var(--panel-strong)]",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
