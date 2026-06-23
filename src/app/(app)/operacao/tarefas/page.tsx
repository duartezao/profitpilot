import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TarefasClient } from "./tarefas-client";
import { getCurrentUser } from "@/lib/auth";
import { roleRank } from "@/lib/rbac";
import { buildOperationTaskBoard } from "@/lib/operation-tasks";

export const metadata: Metadata = { title: "Tarefas · Operação" };

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    taskStore?: string;
    store?: string;
    assignee?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const filterRaw = params.filter ?? "all";
  const filter =
    filterRaw === "workspace" || filterRaw === "store" ? filterRaw : "all";
  const taskStore = params.taskStore ?? params.store ?? null;
  const assigneeRaw = params.assignee ?? "all";
  const assignee =
    assigneeRaw === "mine" || assigneeRaw === "unassigned"
      ? assigneeRaw
      : "all";

  const board = await buildOperationTaskBoard(user, {
    scope: filter,
    storeId: taskStore,
    assignee,
  });
  const canEdit = roleRank(user.role) >= roleRank("editor");

  return (
    <TarefasClient
      board={board}
      canEdit={canEdit}
      initialFilter={filter}
      initialStoreId={taskStore}
      initialAssigneeFilter={assignee}
    />
  );
}
