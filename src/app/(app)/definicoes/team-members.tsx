"use client";

import { useActionState } from "react";
import { UserMinus } from "lucide-react";
import { Sensitive } from "@/components/privacy-mode";
import type { WorkspaceMemberView } from "@/lib/members";
import {
  updateMemberRoleAction,
  revokeMemberAction,
  type MemberActionState,
} from "./members-actions";
import { canModifyMember } from "@/lib/rbac";
import { InviteMemberForm } from "./invite-member-form";
import { SentInvitations } from "./sent-invitations";
import { MemberStoreAccessEditor } from "./member-store-access-editor";
import type { SentInvitationView } from "@/lib/invitation-types";

const roleLabel: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  editor: "Editor",
  viewer: "Visualizador",
};

const selectCls =
  "rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-60";

function MemberRow({
  member,
  actorRole,
  actorUserId,
  canManage,
  stores,
}: {
  member: WorkspaceMemberView;
  actorRole: string;
  actorUserId: string;
  canManage: boolean;
  stores: Array<{ id: string; name: string }>;
}) {
  const [roleState, updateRole, updating] = useActionState<
    MemberActionState,
    FormData
  >(updateMemberRoleAction, {});
  const [revokeState, revoke, revoking] = useActionState<
    MemberActionState,
    FormData
  >(revokeMemberAction, {});

  const modifiable =
    canManage &&
    canModifyMember(actorRole, member.role, actorUserId, member.userId).ok;

  const error = roleState.error ?? revokeState.error;

  return (
    <tr className="border-t border-border align-middle">
      <td className="px-4 py-3">
        <Sensitive as="p" className="font-medium">{member.name}</Sensitive>
        {member.username && (
          <Sensitive as="p" className="text-xs text-muted-foreground">
            @{member.username}
          </Sensitive>
        )}
        <Sensitive as="p" className="text-xs text-muted-foreground">{member.email}</Sensitive>
        {member.isSelf && (
          <span className="text-xs text-muted-foreground">(tu)</span>
        )}
      </td>
      <td className="px-4 py-3">
        {modifiable ? (
          <form action={updateRole} className="inline-flex items-center gap-2">
            <input type="hidden" name="membershipId" value={member.membershipId} />
            <select
              name="role"
              defaultValue={member.role}
              disabled={updating}
              className={selectCls}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            >
              <option value="admin">Administrador</option>
              <option value="editor">Editor</option>
              <option value="viewer">Visualizador</option>
            </select>
          </form>
        ) : (
          <span className="text-sm">{roleLabel[member.role] ?? member.role}</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        <span>{member.storeAccessLabel}</span>
        {modifiable && member.role !== "owner" && (
          <MemberStoreAccessEditor member={member} stores={stores} />
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {modifiable ? (
          <form action={revoke}>
            <input type="hidden" name="membershipId" value={member.membershipId} />
            <button
              type="submit"
              disabled={revoking}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-negative hover:bg-muted disabled:opacity-60"
            >
              <UserMinus className="h-3.5 w-3.5" />
              {revoking ? "…" : "Remover"}
            </button>
          </form>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {error && (
          <p className="mt-1 text-xs text-negative">{error}</p>
        )}
      </td>
    </tr>
  );
}

export function TeamMembers({
  members,
  actorRole,
  actorUserId,
  canManage,
  stores,
  sentInvitations,
}: {
  members: WorkspaceMemberView[];
  actorRole: string;
  actorUserId: string;
  canManage: boolean;
  stores: Array<{ id: string; name: string }>;
  sentInvitations: SentInvitationView[];
}) {
  if (members.length === 0 && !canManage) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">
        Ainda não há outros membros neste workspace.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <>
          <InviteMemberForm stores={stores} />
          <SentInvitations invitations={sentInvitations} />
        </>
      )}

      {members.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">
          Ainda não há outros membros neste workspace.
        </p>
      ) : (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs font-medium text-muted-foreground">
            <th className="px-4 py-3">Membro</th>
            <th className="px-4 py-3">Papel</th>
            <th className="px-4 py-3">Lojas</th>
            <th className="px-4 py-3 text-right">Acesso</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <MemberRow
              key={m.membershipId}
              member={m}
              actorRole={actorRole}
              actorUserId={actorUserId}
              canManage={canManage}
              stores={stores}
            />
          ))}
        </tbody>
      </table>
      {canManage && (
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          Só o proprietário pode convidar, alterar papéis ou remover membros.
        </p>
      )}
    </div>
      )}
    </div>
  );
}
