import { cn } from "@/lib/utils";
import type { WaterfallStep } from "@/lib/metrics";

export function WaterfallChart({ steps }: { steps: WaterfallStep[] }) {
  const maxVal = Math.max(...steps.map((s) => Math.abs(s.value)), 1);
  const barMax = 160;

  return (
    <div className="mt-6" data-sensitive-chart>
      <div className="flex items-end justify-between gap-1 sm:gap-2">
        {steps.map((step) => {
          const h = Math.max(16, (Math.abs(step.value) / maxVal) * barMax);
          return (
            <div
              key={step.key}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <span
                className="max-w-full whitespace-normal break-words text-center text-[10px] leading-tight tabular-nums text-muted-foreground sm:text-xs"
                title={step.display}
              >
                {step.display}
              </span>
              <div
                className={cn(
                  "w-full max-w-14 rounded-sm sm:max-w-16",
                  step.type === "total" && "bg-chart-positive",
                  step.type === "start" && "bg-chart-neutral/45",
                  step.type === "negative" && "bg-chart-neutral/25",
                )}
                style={{ height: h }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-between gap-1 sm:gap-2">
        {steps.map((step) => (
          <p
            key={`${step.key}-lbl`}
            className="min-w-0 flex-1 text-center text-[10px] leading-tight text-muted-foreground sm:text-xs"
          >
            {step.type === "negative" ? `− ${step.label}` : step.label}
          </p>
        ))}
      </div>
    </div>
  );
}
