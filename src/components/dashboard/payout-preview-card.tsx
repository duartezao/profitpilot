import { Calendar, Wallet } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import type { StorePayoutPreview } from "@/lib/metrics";

export function PayoutPreviewCard({ payout }: { payout: StorePayoutPreview }) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">
          A receber (payout)
        </p>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
          <Wallet className="h-5 w-5 text-accent" />
        </div>
      </div>
      <Sensitive
        className="mt-3 block truncate text-2xl font-semibold tabular-nums sm:text-3xl"
        title={payout.amountFmt}
      >
        {payout.amountFmt}
      </Sensitive>
      <div className="mt-auto flex items-center gap-2 pt-6 text-xs text-muted-foreground">
        <Calendar className="h-3.5 w-3.5 shrink-0" />
        <span>próximo pagamento</span>
        <span className="font-medium text-foreground tabular-nums">
          {payout.nextDateLabel ?? "—"}
        </span>
      </div>
    </div>
  );
}
