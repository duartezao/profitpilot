import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { Order } from "@/models/Order";
import { OperationTask } from "@/models/OperationTask";
import { TestCollection } from "@/models/TestCollection";
import { ManualAdSpend } from "@/models/ManualAdSpend";
import { AdCampaignDay } from "@/models/AdCampaignDay";

/** Evita martelar Mongo no poll SSE (~10 s). */
const REV_MEM_TTL_MS = 2_500;
const revMem = new Map<string, { rev: string; at: number }>();

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

type StoreRevisionAgg = {
  maxUpdated?: Date;
  ops?: string[];
};

async function computeWorkspaceRevision(workspaceId: string): Promise<string> {
  await connectToDatabase();
  const wsOid = new mongoose.Types.ObjectId(workspaceId);
  const base = { workspaceId: wsOid, deletedAt: null };

  const [
    storeTs,
    orderTs,
    taskTs,
    collectionTs,
    manualAdTs,
    campaignTs,
    storeAgg,
  ] = await Promise.all([
    latestUpdatedAt(Store, base),
    latestUpdatedAt(Order, { workspaceId: wsOid }),
    latestUpdatedAt(OperationTask, base),
    latestUpdatedAt(TestCollection, base),
    latestUpdatedAt(ManualAdSpend, { workspaceId: wsOid }),
    latestUpdatedAt(AdCampaignDay, { workspaceId: wsOid }),
    Store.aggregate<StoreRevisionAgg>([
      { $match: base },
      { $sort: { _id: 1 } },
      {
        $group: {
          _id: null,
          maxUpdated: { $max: "$updatedAt" },
          ops: {
            $push: {
              $concat: [
                { $toString: "$_id" },
                ":",
                { $ifNull: ["$operationStatus", ""] },
                ":",
                {
                  $toString: {
                    $ifNull: [{ $toLong: "$operationKilledAt" }, 0],
                  },
                },
              ],
            },
          },
        },
      },
    ]),
  ]);

  const storeRow = storeAgg[0];
  const storeRevisionTs = Math.max(
    storeTs,
    storeRow?.maxUpdated?.getTime() ?? 0,
  );
  const opsSig = storeRow?.ops?.join("|") ?? "";

  return `${storeRevisionTs}-${orderTs}-${taskTs}-${collectionTs}-${manualAdTs}-${campaignTs}-${opsSig}`;
}

/** Assinatura leve para detectar alterações no workspace (SSE live sync). */
export async function getWorkspaceRevision(workspaceId: string): Promise<string> {
  const now = Date.now();
  const hit = revMem.get(workspaceId);
  if (hit && now - hit.at < REV_MEM_TTL_MS) return hit.rev;

  const rev = await computeWorkspaceRevision(workspaceId);
  revMem.set(workspaceId, { rev, at: now });
  return rev;
}
