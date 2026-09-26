import { cn } from "@/lib/utils";

/**
 * Latin/numeric island (MAC, IP, rates, file paths) — always LTR inside
 * the RTL layout, using the mono font.
 */
export function Mono({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      dir="ltr"
      className={cn("font-mono text-[0.95em] ltr-island", className)}
    >
      {children}
    </span>
  );
}
