import "server-only";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import {
  getWorkspacePlatformRefreshToken,
} from "@/lib/ad-platform-credentials";
import {
  loadProfitSheetExportData,
  profitSheetCellRef,
  type ProfitSheetCellUpdate,
} from "@/lib/profit-sheet-data";
import { isGoogleOAuthConfigured } from "@/lib/google-oauth";
import type { CurrentUser } from "@/lib/auth";

function parseServiceAccountJson(): Record<string, unknown> | null {
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    try {
      return JSON.parse(
        Buffer.from(raw, "base64").toString("utf8"),
      ) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? trimmed;
}

export function isProfitSheetTemplateConfigured(): boolean {
  return Boolean(process.env.PROFIT_SHEET_TEMPLATE_ID?.trim());
}

/** OAuth Google (Drive+Sheets) ou conta de serviço — sem chave JSON obrigatória. */
export async function canExportProfitSheet(
  workspaceId: string,
): Promise<boolean> {
  if (!isProfitSheetTemplateConfigured()) return false;
  if (parseServiceAccountJson()) return true;
  if (!isGoogleOAuthConfigured()) return false;
  const cred = await getWorkspacePlatformRefreshToken(
    workspaceId,
    "google-sheets",
  );
  return cred != null;
}

export function profitSheetGoogleSetupMessage(): string {
  return (
    "Configura PROFIT_SHEET_TEMPLATE_ID no servidor e liga o teu Gmail em Métricas " +
    "(OAuth Google Sheets — não precisa de chave de conta de serviço)."
  );
}

function requireGoogleOAuthEnv(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "OAuth Google em falta (GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET).",
    );
  }
  return { clientId, clientSecret };
}

type ProfitSheetAuth =
  | OAuth2Client
  | InstanceType<typeof google.auth.GoogleAuth>;

async function resolveProfitSheetAuth(
  workspaceId: string,
): Promise<ProfitSheetAuth> {
  const serviceAccount = parseServiceAccountJson();
  if (serviceAccount) {
    return new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/spreadsheets",
      ],
    });
  }

  const cred = await getWorkspacePlatformRefreshToken(
    workspaceId,
    "google-sheets",
  );
  if (!cred) {
    throw new Error(
      "Liga o teu Gmail para exportar Profit Sheet (/api/oauth/google-sheets/start).",
    );
  }

  const { clientId, clientSecret } = requireGoogleOAuthEnv();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: cred.refreshToken });
  return oauth2;
}

function chunkUpdates<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function applyCellUpdates(
  spreadsheetId: string,
  updates: ProfitSheetCellUpdate[],
  auth: ProfitSheetAuth,
): Promise<void> {
  const sheets = google.sheets({ version: "v4", auth });
  const batches = chunkUpdates(updates, 100);

  for (const batch of batches) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: batch.map((u) => ({
          range: profitSheetCellRef(u),
          values: [[u.value]],
        })),
      },
    });
  }
}

/** Duplica o template Google Sheets, preenche células e devolve URL de edição. */
export async function buildProfitSheetGoogleSpreadsheet(
  user: Pick<CurrentUser, "workspaceId" | "storeAccess" | "email">,
  storeId: string,
): Promise<{ url: string; storeName: string } | null> {
  if (!(await canExportProfitSheet(user.workspaceId))) {
    throw new Error(profitSheetGoogleSetupMessage());
  }

  const data = await loadProfitSheetExportData(user, storeId);
  if (!data) return null;

  const templateId = extractSpreadsheetId(
    process.env.PROFIT_SHEET_TEMPLATE_ID!.trim(),
  );

  const auth = await resolveProfitSheetAuth(user.workspaceId);
  const drive = google.drive({ version: "v3", auth });
  const copyTitle = `Profit Sheet · ${data.storeName} · ${data.importKey}–${data.endKey}`;
  const copy = await drive.files.copy({
    fileId: templateId,
    supportsAllDrives: true,
    requestBody: {
      name: copyTitle,
      /** Converte .xlsx / Office para Google Sheets nativo (Sheets API exige isto). */
      mimeType: "application/vnd.google-apps.spreadsheet",
    },
  });

  const spreadsheetId = copy.data.id;
  if (!spreadsheetId) {
    throw new Error("Falha ao duplicar o template Google Sheets.");
  }

  if (data.updates.length > 0) {
    await applyCellUpdates(spreadsheetId, data.updates, auth);
  }

  return {
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    storeName: data.storeName,
  };
}

function googleApiErrorText(error: unknown): string {
  const parts: string[] = [];
  let cur: unknown = error;
  for (let depth = 0; depth < 5 && cur != null; depth++) {
    if (typeof cur === "object") {
      const obj = cur as Record<string, unknown>;
      if (typeof obj.message === "string") parts.push(obj.message);
      if (typeof obj.error === "string") parts.push(obj.error);
      cur = obj.cause ?? null;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  return parts.join(" ");
}

export function humanizeProfitSheetGoogleError(error: unknown): string {
  const msg = googleApiErrorText(error);

  if (
    msg.includes("drive.googleapis.com") ||
    msg.includes("Google Drive API has not been used") ||
    (msg.includes("Drive API") && msg.includes("disabled"))
  ) {
    return (
      "Activa a Google Drive API no projecto 1064194775444: " +
      "https://console.cloud.google.com/apis/library/drive.googleapis.com?project=1064194775444 " +
      "— e também a Google Sheets API. Espera 2 minutos e tenta outra vez."
    );
  }
  if (
    msg.includes("sheets.googleapis.com") ||
    msg.includes("Google Sheets API has not been used") ||
    (msg.includes("Sheets API") && msg.includes("disabled"))
  ) {
    return (
      "Activa a Google Sheets API: " +
      "https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=1064194775444"
    );
  }
  if (
    msg.includes("Office file") ||
    msg.includes("not supported for this document")
  ) {
    return (
      "O template tem de ser um Google Sheets nativo (não um .xlsx no Drive). " +
      "Abre o ficheiro → Ficheiro → Guardar como Google Sheets e usa esse link no PROFIT_SHEET_TEMPLATE_ID."
    );
  }
  if (
    msg.toLowerCase().includes("permission") ||
    msg.includes("403") ||
    msg.includes("PERMISSION_DENIED")
  ) {
    return (
      "Sem permissão para aceder ao template. Confirma que o Gmail ligado tem acesso " +
      "ao Google Sheets template e que as APIs Drive + Sheets estão activas no projecto OAuth."
    );
  }
  return msg || "Erro ao exportar Profit Sheet.";
}

/** @deprecated usar canExportProfitSheet */
export function isProfitSheetGoogleConfigured(): boolean {
  return isProfitSheetTemplateConfigured() && isGoogleOAuthConfigured();
}
