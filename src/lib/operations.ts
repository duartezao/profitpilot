import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Store } from "@/models/Store";
import { TestCollection } from "@/models/TestCollection";
import { TestProduct } from "@/models/TestProduct";
import { activeStoreQueryForUser } from "@/lib/store-scope";
import type { CurrentUser } from "@/lib/auth";
import {
  COLLECTION_PIPELINE_LABEL,
  COLLECTION_PIPELINE_STATUSES,
  PRODUCT_PIPELINE_LABEL,
  PRODUCT_PIPELINE_STATUSES,
  STORE_OPERATION_LABEL,
  STORE_OPERATION_STATUSES,
  defaultStoreOperationFromSyncStatus,
  normalizeCollectionPipelineStatus,
  normalizeProductPipelineStatus,
  normalizeStoreOperationStatus,
  type CollectionPipelineStatus,
  type ProductPipelineStatus,
  type StoreOperationStatus,
} from "@/lib/operations-pipeline";
import {
  dateKeyFromDate,
  daysBetweenKeys,
  formatCycleProgress,
  reminderUrgency,
  DEFAULT_COLLECTION_REMINDER_DAYS_BEFORE,
} from "@/lib/collection-schedule";
import { formatDateInput, startOfDay } from "@/lib/period";
import { getStoreDisplayUrl } from "@/lib/store-display";

export type OperationsStoreRow = {
  id: string;
  name: string;
  displayUrl: string | null;
  syncStatus: string;
  operationStatus: StoreOperationStatus;
};

export type PipelineCount<T extends string> = Record<T, number>;

export type OperationsOverview = {
  stores: OperationsStoreRow[];
  storeCounts: PipelineCount<StoreOperationStatus>;
  collectionCounts: PipelineCount<CollectionPipelineStatus>;
  productCounts: PipelineCount<ProductPipelineStatus>;
  recentCollections: {
    id: string;
    storeId: string;
    storeName: string;
    name: string;
    status: CollectionPipelineStatus;
    statusLabel: string;
  }[];
  recentProducts: {
    id: string;
    storeId: string;
    storeName: string;
    name: string;
    collectionName: string;
    status: ProductPipelineStatus;
    statusLabel: string;
  }[];
};

function emptyCounts<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
}

function bump<T extends string>(map: Record<T, number>, key: T) {
  map[key] = (map[key] ?? 0) + 1;
}

export async function buildOperationsOverview(
  user: CurrentUser,
  storeIdFilter?: string | null,
): Promise<OperationsOverview> {
  await connectToDatabase();
  const wsId = new mongoose.Types.ObjectId(user.workspaceId);
  const storeQuery = activeStoreQueryForUser(user);
  if (storeIdFilter) {
    storeQuery._id = new mongoose.Types.ObjectId(storeIdFilter);
  }

  const stores = await Store.find(storeQuery)
    .select("name displayUrl shopDomain status operationStatus")
    .sort({ name: 1 })
    .lean();

  const storeIds = stores.map((s) => s._id);
  const storeNameById = new Map(stores.map((s) => [String(s._id), s.name]));

  const storeCounts = emptyCounts(STORE_OPERATION_STATUSES);
  const storeRows: OperationsStoreRow[] = stores.map((s) => {
    const operationStatus = normalizeStoreOperationStatus(
      s.operationStatus ??
        defaultStoreOperationFromSyncStatus(s.status ?? "active"),
    );
    bump(storeCounts, operationStatus);
    return {
      id: String(s._id),
      name: s.name,
      displayUrl: getStoreDisplayUrl(s),
      syncStatus: s.status ?? "active",
      operationStatus,
    };
  });

  const collectionFilter = {
    workspaceId: wsId,
    deletedAt: null,
    ...(storeIds.length ? { storeId: { $in: storeIds } } : { storeId: null }),
  };

  const [collections, products] = await Promise.all([
    storeIds.length
      ? TestCollection.find(collectionFilter).sort({ updatedAt: -1 }).lean()
      : Promise.resolve([]),
    storeIds.length
      ? TestProduct.find(collectionFilter).sort({ updatedAt: -1 }).lean()
      : Promise.resolve([]),
  ]);

  const collectionCounts = emptyCounts(COLLECTION_PIPELINE_STATUSES);
  for (const c of collections) {
    bump(
      collectionCounts,
      normalizeCollectionPipelineStatus(c.status ?? "queue"),
    );
  }

  const productCounts = emptyCounts(PRODUCT_PIPELINE_STATUSES);
  for (const p of products) {
    bump(productCounts, normalizeProductPipelineStatus(p.status ?? "testing"));
  }

  const recentCollections = collections.slice(0, 8).map((c) => {
    const status = normalizeCollectionPipelineStatus(c.status ?? "queue");
    return {
      id: String(c._id),
      storeId: String(c.storeId),
      storeName: storeNameById.get(String(c.storeId)) ?? "—",
      name: c.name,
      status,
      statusLabel: COLLECTION_PIPELINE_LABEL[status],
    };
  });

  const recentProducts = products.slice(0, 8).map((p) => {
    const status = normalizeProductPipelineStatus(p.status ?? "testing");
    return {
      id: String(p._id),
      storeId: String(p.storeId),
      storeName: storeNameById.get(String(p.storeId)) ?? "—",
      name: p.name,
      collectionName: (p.collectionName ?? "").trim(),
      status,
      statusLabel: PRODUCT_PIPELINE_LABEL[status],
    };
  });

  return {
    stores: storeRows,
    storeCounts,
    collectionCounts,
    productCounts,
    recentCollections,
    recentProducts,
  };
}

export type TestCollectionView = {
  id: string;
  storeId: string;
  storeName: string;
  name: string;
  status: CollectionPipelineStatus;
  notes: string;
  scheduledStartDate: string | null;
  scheduledStartLabel: string | null;
  testStartedAt: string | null;
  testEndsAt: string | null;
  testEndsLabel: string | null;
  cycleDays: number | null;
  cycleProgress: string | null;
  reminderText: string | null;
  updatedAt: string;
};

export type TestProductView = {
  id: string;
  storeId: string;
  storeName: string;
  name: string;
  collectionName: string;
  status: ProductPipelineStatus;
  notes: string;
  updatedAt: string;
};

export async function listTestCollections(
  user: CurrentUser,
  storeId?: string | null,
): Promise<TestCollectionView[]> {
  await connectToDatabase();
  const wsId = new mongoose.Types.ObjectId(user.workspaceId);
  const storeQuery = activeStoreQueryForUser(user);
  if (storeId) storeQuery._id = new mongoose.Types.ObjectId(storeId);

  const stores = await Store.find(storeQuery)
    .select("name collectionTestCycleDays collectionReminderDaysBefore")
    .lean();
  const storeIds = stores.map((s) => s._id);
  const storeNameById = new Map(stores.map((s) => [String(s._id), s.name]));
  const storeMetaById = new Map(
    stores.map((s) => [
      String(s._id),
      {
        reminderBefore:
          s.collectionReminderDaysBefore ??
          DEFAULT_COLLECTION_REMINDER_DAYS_BEFORE,
        cycleDays: s.collectionTestCycleDays ?? 5,
      },
    ]),
  );

  if (!storeIds.length) return [];

  const todayKey = formatDateInput(startOfDay(new Date()));

  const rows = await TestCollection.find({
    workspaceId: wsId,
    storeId: { $in: storeIds },
    deletedAt: null,
  })
    .sort({ status: 1, scheduledStartDate: 1, updatedAt: -1 })
    .lean();

  return rows.map((c) => {
    const status = normalizeCollectionPipelineStatus(c.status ?? "queue");
    const meta = storeMetaById.get(String(c.storeId));
    const scheduledKey = c.scheduledStartDate
      ? dateKeyFromDate(new Date(c.scheduledStartDate))
      : null;
    const startedKey = c.testStartedAt
      ? dateKeyFromDate(new Date(c.testStartedAt))
      : null;
    const endsKey = c.testEndsAt
      ? dateKeyFromDate(new Date(c.testEndsAt))
      : null;

    let reminderText: string | null = null;
    if (status === "testing" && endsKey && meta) {
      const urg = reminderUrgency(endsKey, todayKey, meta.reminderBefore);
      if (urg === "overdue") reminderText = "Ciclo terminou — trocar coleção";
      else if (urg === "today") reminderText = "Termina hoje";
      else if (urg === "soon") {
        const d = daysBetweenKeys(todayKey, endsKey);
        reminderText = `Trocar em ${d} dia(s)`;
      }
    } else if (status === "queue" && scheduledKey && meta) {
      const urg = reminderUrgency(scheduledKey, todayKey, meta.reminderBefore);
      if (urg === "today") reminderText = "Iniciar teste hoje";
      else if (urg === "soon") {
        const d = daysBetweenKeys(todayKey, scheduledKey);
        reminderText = `Inicia em ${d} dia(s)`;
      }
    }

    const schedDate = c.scheduledStartDate
      ? new Date(c.scheduledStartDate)
      : null;
    const endsDate = c.testEndsAt ? new Date(c.testEndsAt) : null;

    return {
      id: String(c._id),
      storeId: String(c.storeId),
      storeName: storeNameById.get(String(c.storeId)) ?? "—",
      name: c.name,
      status,
      notes: (c.notes ?? "").trim(),
      scheduledStartDate: scheduledKey,
      scheduledStartLabel: schedDate
        ? schedDate.toLocaleDateString("pt-PT", {
            day: "numeric",
            month: "short",
          })
        : null,
      testStartedAt: startedKey,
      testEndsAt: endsKey,
      testEndsLabel: endsDate
        ? endsDate.toLocaleDateString("pt-PT", {
            day: "numeric",
            month: "short",
          })
        : null,
      cycleDays: c.cycleDays ?? meta?.cycleDays ?? null,
      cycleProgress:
        startedKey && endsKey
          ? formatCycleProgress(startedKey, endsKey, todayKey)
          : null,
      reminderText,
      updatedAt: c.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  });
}

export async function listTestProducts(
  user: CurrentUser,
  storeId?: string | null,
): Promise<TestProductView[]> {
  await connectToDatabase();
  const wsId = new mongoose.Types.ObjectId(user.workspaceId);
  const storeQuery = activeStoreQueryForUser(user);
  if (storeId) storeQuery._id = new mongoose.Types.ObjectId(storeId);

  const stores = await Store.find(storeQuery).select("name").lean();
  const storeIds = stores.map((s) => s._id);
  const storeNameById = new Map(stores.map((s) => [String(s._id), s.name]));

  if (!storeIds.length) return [];

  const rows = await TestProduct.find({
    workspaceId: wsId,
    storeId: { $in: storeIds },
    deletedAt: null,
  })
    .sort({ updatedAt: -1 })
    .lean();

  return rows.map((p) => {
    const status = normalizeProductPipelineStatus(p.status ?? "testing");
    return {
      id: String(p._id),
      storeId: String(p.storeId),
      storeName: storeNameById.get(String(p.storeId)) ?? "—",
      name: p.name,
      collectionName: (p.collectionName ?? "").trim(),
      status,
      notes: (p.notes ?? "").trim(),
      updatedAt: p.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  });
}
