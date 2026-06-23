import { cn } from "@/lib/utils";

const toneMap = {
  neutral: "border-border bg-muted/40 text-foreground",
  accent: "border-accent/30 bg-accent/10 text-accent",
  positive: "border-positive/30 bg-positive/10 text-positive",
  negative: "border-negative/30 bg-negative/10 text-negative",
  warning: "border-warning/30 bg-warning/10 text-warning",
} as const;

export function PipelineStatusPill({
  label,
  tone = "neutral",
  className,
}: {
  label: string;
  tone?: keyof typeof toneMap;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
        toneMap[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

export function storeOperationTone(
  status: string,
): keyof typeof toneMap {
  if (status === "running") return "positive";
  if (status === "waiting") return "warning";
  return "negative";
}

export function collectionPipelineTone(
  status: string,
): keyof typeof toneMap {
  if (status === "winner") return "positive";
  if (status === "failed") return "negative";
  if (status === "testing") return "accent";
  if (status === "skipped") return "neutral";
  return "warning";
}

export function productPipelineTone(status: string): keyof typeof toneMap {
  if (status === "winner") return "positive";
  if (status === "failed") return "negative";
  if (status === "tested") return "accent";
  return "warning";
}
