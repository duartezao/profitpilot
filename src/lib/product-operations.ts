import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { TestProduct } from "@/models/TestProduct";
import { Store } from "@/models/Store";
import {
  PRODUCT_PIPELINE_LABEL,
  normalizeProductPipelineStatus,
} from "@/lib/operations-pipeline";

export type ProductReportBlock = {
  lines: string[];
  testingNow: string | null;
  testedList: string;
  failedList: string;
};

export async function buildProductReportBlock(
  workspaceId: string,
  storeId: string,
): Promise<ProductReportBlock> {
  await connectToDatabase();

  const store = await Store.findOne({
    _id: storeId,
    workspaceId,
    deletedAt: null,
  })
    .select("name")
    .lean();

  if (!store) {
    return { lines: [], testingNow: null, testedList: "", failedList: "" };
  }

  const rows = await TestProduct.find({
    workspaceId: new mongoose.Types.ObjectId(workspaceId),
    storeId: new mongoose.Types.ObjectId(storeId),
    deletedAt: null,
  })
    .sort({ status: 1, updatedAt: -1 })
    .lean();

  const lines: string[] = [];
  const testing: string[] = [];
  const tested: string[] = [];
  const failed: string[] = [];

  for (const p of rows) {
    const st = normalizeProductPipelineStatus(p.status);
    const label = p.collectionName
      ? `${p.name} (${p.collectionName})`
      : p.name;
    if (st === "testing") testing.push(label);
    else if (st === "tested" || st === "winner")
      tested.push(`${label} (${PRODUCT_PIPELINE_LABEL[st].toLowerCase()})`);
    else if (st === "failed") failed.push(label);
  }

  const testingNow = testing.length ? testing.join(", ") : null;
  const testedList = tested.join(", ");
  const failedList = failed.join(", ");

  if (testingNow) lines.push(`PRODUTOS A TESTAR: ${testingNow}`);
  if (testedList) lines.push(`PRODUTOS JÁ TESTADOS: ${testedList}`);
  if (failedList) lines.push(`PRODUTOS FALHADOS: ${failedList}`);

  return { lines, testingNow, testedList, failedList };
}
