import "server-only";
import type { Types } from "mongoose";
import { Order } from "@/models/Order";
import { addBusinessDaysToDateKey } from "@/lib/business-days";
import { mergePaidOrderFilter } from "@/lib/order-financial-status";
import { orderMerchantPayoutBase } from "@/lib/order-merchant-payout";
import { orderDateMatch } from "@/lib/period";
import { dateKeyInTimezone, normalizeStoreTimezone, orderDateMatchInTimezone } from "@/lib/store-timezone";
import type { IncomingDayLine } from "@/lib/treasury-day-lines";

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function dayLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export type ExternalGatewayTreasury = {
  incoming: number;
  received: number;
  incomingByDay: IncomingDayLine[];
  receivedByDay: IncomingDayLine[];
};

/** Hora típica de chegada do payout externo no fuso da loja (Stripe ~07:00). */
export const EXTERNAL_GATEWAY_PAYOUT_HOUR = 7;

/**
 * Gateway externo (Stripe/PayPal/MB): o dinheiro costuma cair ~07:00 no fuso da loja.
 * No **dia de payout**, só entra em «recebido» após essa hora — antes fica em «a receber».
 */
export function isExternalGatewayPayoutReceived(
  payoutDateKey: string,
  todayDateKey: string,
  opts?: { now?: Date; timeZone?: string | null },
): boolean {
  if (payoutDateKey < todayDateKey) return true;
  if (payoutDateKey > todayDateKey) return false;

  const now = opts?.now ?? new Date();
  const tz = normalizeStoreTimezone(opts?.timeZone);
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  return hour >= EXTERNAL_GATEWAY_PAYOUT_HOUR;
}

/** Gateway Shopify Payments — entra nos payouts sync, não na projeção externa. */
export const SHOPIFY_PAYMENTS_GATEWAY = "shopify_payments";

export function isExplicitExternalPaymentGateway(
  gateway: string | null | undefined,
): boolean {
  if (!gateway || !gateway.trim()) return false;
  return gateway.trim().toLowerCase() !== SHOPIFY_PAYMENTS_GATEWAY;
}

/**
 * Encomendas a projectar como gateway externo (evita double-count com Shopify Payments).
 * Loja mista: exclui `feesSource: real` (já entram nos payouts Shopify) e gateway
 * `shopify_payments`. Encomendas com gateway null + taxa estimada são Stripe/PayPal
 * até o sync gravar o gateway — têm de contar na projeção externa.
 */
export function externalGatewayOrderFilter(shopifyPaymentsActive: boolean) {
  if (!shopifyPaymentsActive) return {};
  return {
    feesSource: { $ne: "real" },
    paymentGateway: { $ne: SHOPIFY_PAYMENTS_GATEWAY },
  };
}

/**
 * Projecta entradas de gateway externo (Multibanco, PayPal, etc.):
 * cada encomenda paga cai na conta N dias úteis após a data da venda.
 * Com Shopify Payments activo, só encomendas com taxa estimada (gateway externo).
 */
export async function buildExternalGatewayTreasury(
  storeId: Types.ObjectId,
  businessDays: number,
  since: Date,
  todayKey: string,
  storeTimeZone: string | null,
  fmt: (v: number) => string,
  shopifyPaymentsActive = false,
): Promise<ExternalGatewayTreasury | null> {
  if (!businessDays || businessDays <= 0) return null;

  const tz = storeTimeZone ?? undefined;
  const slice = { start: since, end: new Date() };
  const orders = await Order.find(
    mergePaidOrderFilter({
      storeId,
      ...externalGatewayOrderFilter(shopifyPaymentsActive),
      ...(tz ? orderDateMatchInTimezone(slice, tz) : orderDateMatch(slice)),
    }),
  )
    .select("orderDate totalPrice subtotal netRevenue refunded fees feesSource amountsBase")
    .lean();

  const incomingMap = new Map<string, number>();
  const receivedMap = new Map<string, number>();
  let incoming = 0;
  let received = 0;

  for (const order of orders) {
    const orderKey = dateKeyInTimezone(
      new Date(order.orderDate),
      normalizeStoreTimezone(storeTimeZone),
    );
    const payoutKey = addBusinessDaysToDateKey(orderKey, businessDays);
    const amount = orderMerchantPayoutBase(order);
    if (amount <= 0) continue;

    if (isExternalGatewayPayoutReceived(payoutKey, todayKey, { timeZone: storeTimeZone })) {
      received += amount;
      receivedMap.set(payoutKey, (receivedMap.get(payoutKey) ?? 0) + amount);
    } else {
      incoming += amount;
      incomingMap.set(payoutKey, (incomingMap.get(payoutKey) ?? 0) + amount);
    }
  }

  const toLines = (
    map: Map<string, number>,
    kind: IncomingDayLine["kind"],
    kindLabel: string,
  ): IncomingDayLine[] =>
    [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, amount]) => ({
        date,
        dateLabel: dayLabel(date),
        amount,
        amountFmt: fmt(amount),
        kind,
        kindLabel,
      }));

  return {
    incoming,
    received,
    incomingByDay: toLines(incomingMap, "external_gateway", "Gateway externo"),
    receivedByDay: toLines(receivedMap, "external_gateway", "Gateway externo"),
  };
}
