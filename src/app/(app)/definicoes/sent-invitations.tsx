"use client";

import { useActionState } from "react";
import { Sensitive } from "@/components/privacy-mode";
import type { SentInvitationView } from "@/lib/invitation-types";
import {
  revokeInvitationAction,
  type InviteActionState,
} from "./invite-actions";

const roleLabel: Record<string, string> = {
  admin: "Administrador",
  editor: "Editor",
  viewer: "Visualizador",
};

function SentRow({ invite }: { invite: SentInvitationView }) {
  const [state, revoke, pending] = useActionState<
    InviteActionState,
    FormData
  >(revokeInvitationAction, {});

  return (
    <tr className="border-t border-border align-middle text-sm">
      <td className="px-4 py-3">
        <Sensitive as="span">{invite.inviteeLabel}</Sensitive>
      </td>
      <td className="px-4 py-3">{roleLabel[invite.role] ?? invite.role}</td>
      <td className="px-4 py-3 text-muted-foreground">
        {invite.storeAccessLabel}
      </td>
      <td className="px-4 py-3 text-right">
        <form action={revoke} className="inline">
          <input type="hidden" name="invitationId" value={invite.id} />
          <button
            type="submit"
            disabled={pending}
            className="text-xs font-medium text-negative hover:underline disabled:opacity-60"
          >
            {pending ? "…" : "Revogar"}
          </button>
        </form>
        {state.error && (
          <p className="mt-1 text-xs text-negative">{state.error}</p>
        )}
      </td>
    </tr>
  );
}

export function SentInvitations({
  invitations,
}: {
  invitations: SentInvitationView[];
}) {
  if (!invitations.length) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <p className="border-b border-border px-4 py-3 text-xs font-medium text-muted-foreground">
        Convites à espera de aceitação
      </p>
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="text-left text-xs font-medium text-muted-foreground">
            <th className="px-4 py-3">Convidado</th>
            <th className="px-4 py-3">Papel</th>
            <th className="px-4 py-3">Lojas</th>
            <th className="px-4 py-3 text-right">Ação</th>
          </tr>
        </thead>
        <tbody>
          {invitations.map((inv) => (
            <SentRow key={inv.id} invite={inv} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
