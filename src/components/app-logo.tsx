import { cn } from "@/lib/utils";

export function AppLogo({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="ProfitPilot"
      className={cn(
        "truncate text-base font-semibold tracking-tight",
        className,
      )}
    >
      Profit<span className="text-accent">Pilot</span>
    </span>
  );
}
