import { Calendar, Wallet } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import type { StorePayoutPreview } from "@/lib/metrics";

export function PayoutPreviewCard({ payout }: { payout: StorePayoutPreview }) {
  return (
    <div className="relative flex h-full min-w-0 flex-col rounded-lg border border-border bg-surface p-5">
      <div className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
        <Wallet className="h-5 w-5 text-accent" />
      </div>

      <p className="pr-12 text-[13px] font-medium text-muted-foreground">
        A receber (payout)
      </p>
      <Sensitive
        className="mt-1 block truncate text-xl font-semibold tabular-nums sm:text-2xl lg:text-3xl"
        title={payout.amountFmt}
      >
        {payout.amountFmt}
      </Sensitive>

      <div className="mt-auto flex items-center gap-2 pt-6 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4 shrink-0 text-accent" />
        <span>próximo pagamento</span>
        <span className="font-medium text-foreground tabular-nums">
          {payout.nextDateLabel ?? "—"}
        </span>
      </div>
    </div>
  );
}
