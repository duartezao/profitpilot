import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { ResearchItem } from "@/models/ResearchItem";
import { User } from "@/models/User";
import { formatDateInput, parseDateInput, startOfDay } from "@/lib/period";
import {
  RESEARCH_GENDER_LABEL,
  RESEARCH_KIND_LABEL,
  RESEARCH_STATUS_LABEL,
  type ResearchGender,
  type ResearchKind,
  type ResearchStatus,
} from "@/lib/research-types";
import type { CurrentUser } from "@/lib/auth";

export type ResearchItemView = {
  id: string;
  kind: ResearchKind;
  kindLabel: string;
  name: string;
  reach: number | null;
  activeDays: number | null;
  fbAdLink: string;
  storeLink: string;
  market: string;
  researchedAtKey: string;
  researchedAtLabel: string;
  gender: ResearchGender;
  genderLabel: string;
  notes: string;
  angle: string;
  status: ResearchStatus;
  statusLabel: string;
  createdByName: string | null;
  updatedAtIso: string;
};

function toView(
  doc: {
    _id: mongoose.Types.ObjectId;
    kind: string;
    name: string;
    reach?: number | null;
    activeDays?: number | null;
    fbAdLink?: string | null;
    storeLink?: string | null;
    market?: string | null;
    researchedAt: Date;
    gender?: string | null;
    notes?: string | null;
    angle?: string | null;
    status?: string | null;
    createdBy?: mongoose.Types.ObjectId | null;
    updatedAt?: Date;
  },
  creatorNames: Map<string, string>,
): ResearchItemView {
  const kind = (doc.kind === "collection" ? "collection" : "product") as ResearchKind;
  const gender = (
    doc.gender === "female" ||
    doc.gender === "male" ||
    doc.gender === "unisex"
      ? doc.gender
      : "unknown"
  ) as ResearchGender;
  const status = (
    doc.status === "shortlist" ||
    doc.status === "testing" ||
    doc.status === "winner" ||
    doc.status === "rejected"
      ? doc.status
      : "new"
  ) as ResearchStatus;
  const researchedAt = new Date(doc.researchedAt);
  const createdById = doc.createdBy ? String(doc.createdBy) : null;

  return {
    id: String(doc._id),
    kind,
    kindLabel: RESEARCH_KIND_LABEL[kind],
    name: doc.name,
    reach: doc.reach ?? null,
    activeDays: doc.activeDays ?? null,
    fbAdLink: (doc.fbAdLink ?? "").trim(),
    storeLink: (doc.storeLink ?? "").trim(),
    market: (doc.market ?? "").trim(),
    researchedAtKey: formatDateInput(researchedAt),
    researchedAtLabel: researchedAt.toLocaleDateString("pt-PT", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    gender,
    genderLabel: RESEARCH_GENDER_LABEL[gender],
    notes: (doc.notes ?? "").trim(),
    angle: (doc.angle ?? "").trim(),
    status,
    statusLabel: RESEARCH_STATUS_LABEL[status],
    createdByName: createdById ? creatorNames.get(createdById) ?? null : null,
    updatedAtIso: doc.updatedAt
      ? new Date(doc.updatedAt).toISOString()
      : researchedAt.toISOString(),
  };
}

export async function listResearchItems(
  user: Pick<CurrentUser, "workspaceId">,
  opts?: {
    kind?: ResearchKind | "all";
    status?: ResearchStatus | "all";
    q?: string;
    limit?: number;
  },
): Promise<ResearchItemView[]> {
  await connectToDatabase();
  const wsId = new mongoose.Types.ObjectId(user.workspaceId);
  const filter: Record<string, unknown> = {
    workspaceId: wsId,
    deletedAt: null,
  };

  if (opts?.kind && opts.kind !== "all") filter.kind = opts.kind;
  if (opts?.status && opts.status !== "all") filter.status = opts.status;

  const q = opts?.q?.trim();
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [
      { name: rx },
      { market: rx },
      { notes: rx },
      { angle: rx },
      { fbAdLink: rx },
      { storeLink: rx },
    ];
  }

  const rows = await ResearchItem.find(filter)
    .sort({ researchedAt: -1, createdAt: -1 })
    .limit(Math.min(Math.max(opts?.limit ?? 200, 1), 500))
    .lean();

  const creatorIds = [
    ...new Set(
      rows
        .map((r) => (r.createdBy ? String(r.createdBy) : null))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const creators =
    creatorIds.length > 0
      ? await User.find({ _id: { $in: creatorIds } })
          .select("name email")
          .lean()
      : [];
  const creatorNames = new Map(
    creators.map((u) => [
      String(u._id),
      (u.name?.trim() || u.email?.trim() || "Membro") as string,
    ]),
  );

  return rows.map((r) => toView(r, creatorNames));
}

export function resolveResearchDate(dateKey?: string | null): Date {
  const parsed = dateKey?.trim() ? parseDateInput(dateKey.trim()) : null;
  return startOfDay(parsed ?? new Date());
}
