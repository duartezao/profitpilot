"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";
import type { PendingInvitationView } from "@/lib/invitation-types";
import {
  acceptInvitationAction,
  declineInvitationAction,
  type InviteActionState,
} from "./invite-actions";

const roleLabel: Record<string, string> = {
  admin: "Administrador",
  editor: "Editor",
  viewer: "Visualizador",
};

function InviteCard({ invite }: { invite: PendingInvitationView }) {
  const [acceptState, accept, accepting] = useActionState<
    InviteActionState,
    FormData
  >(acceptInvitationAction, {});
  const [declineState, decline, declining] = useActionState<
    InviteActionState,
    FormData
  >(declineInvitationAction, {});

  const error = acceptState.error ?? declineState.error;
  const expires = new Date(invite.expiresAt).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "short",
  });

  return (
    <div className="rounded-lg border border-accent/40 bg-accent/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
          <Mail className="h-4 w-4 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            Convite para{" "}
            <span data-sensitive className="font-semibold">
              {invite.workspaceName}
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {invite.invitedByName} convidou-te como{" "}
            <strong>{roleLabel[invite.role] ?? invite.role}</strong> ·{" "}
            {invite.storeAccessLabel}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Expira a {expires}
          </p>
          {error && <p className="mt-2 text-xs text-negative">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={accept}>
              <input type="hidden" name="invitationId" value={invite.id} />
              <button
                type="submit"
                disabled={accepting || declining}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60"
              >
                {accepting ? "…" : "Aceitar"}
              </button>
            </form>
            <form action={decline}>
              <input type="hidden" name="invitationId" value={invite.id} />
              <button
                type="submit"
                disabled={accepting || declining}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
              >
                {declining ? "…" : "Recusar"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PendingInvitations({
  invitations,
  embedded = false,
}: {
  invitations: PendingInvitationView[];
  embedded?: boolean;
}) {
  if (!invitations.length) return null;

  return (
    <section className="space-y-3">
      {!embedded && (
        <h2 className="text-lg font-semibold">Convites pendentes</h2>
      )}
      <div className="space-y-3">
        {invitations.map((inv) => (
          <InviteCard key={inv.id} invite={inv} />
        ))}
      </div>
    </section>
  );
}
