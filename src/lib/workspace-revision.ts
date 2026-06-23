import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { OperationTask } from "@/models/OperationTask";
import { TestCollection } from "@/models/TestCollection";

async function latestUpdatedAt(
  model: mongoose.Model<{ updatedAt?: Date }>,
  filter: Record<string, unknown>,
): Promise<number> {
  const row = await model
    .findOne(filter)
    .sort({ updatedAt: -1 })
    .select("updatedAt")
    .lean();
  return row?.updatedAt?.getTime() ?? 0;
}

/** Assinatura leve para detectar alterações no workspace (SSE live sync). */
export async function getWorkspaceRevision(workspaceId: string): Promise<string> {
  await connectToDatabase();
  const wsOid = new mongoose.Types.ObjectId(workspaceId);
  const base = { workspaceId: wsOid, deletedAt: null };

  const [storeTs, taskTs, collectionTs, storeOps] = await Promise.all([
    latestUpdatedAt(Store, base),
    latestUpdatedAt(OperationTask, base),
    latestUpdatedAt(TestCollection, base),
    Store.find(base)
      .select("operationStatus operationKilledAt updatedAt")
      .lean(),
  ]);

  const opsSig = storeOps
    .map(
      (s) =>
        `${s._id}:${s.operationStatus ?? ""}:${s.operationKilledAt?.getTime() ?? 0}`,
    )
    .sort()
    .join("|");

  return `${storeTs}-${taskTs}-${collectionTs}-${opsSig}`;
}
