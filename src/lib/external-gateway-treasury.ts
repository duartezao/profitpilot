import "server-only";
import type { Types } from "mongoose";
import { Order } from "@/models/Order";
import { addBusinessDaysToDateKey } from "@/lib/business-days";
import { mergePaidOrderFilter } from "@/lib/order-financial-status";
import {
  orderFeesBase,
  orderMerchantPayoutBase,
  orderRefundedBase,
} from "@/lib/order-money";
import { orderDateMatch } from "@/lib/period";
import { dateKeyInTimezone, normalizeStoreTimezone, orderDateMatchInTimezone } from "@/lib/store-timezone";
import type { IncomingDayLine } from "@/lib/treasury";

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

/**
 * Projecta entradas de gateway externo (Multibanco, PayPal, etc.):
 * cada encomenda paga cai na conta N dias úteis após a data da venda.
 */
export async function buildExternalGatewayTreasury(
  storeId: Types.ObjectId,
  businessDays: number,
  since: Date,
  todayKey: string,
  storeTimeZone: string | null,
  fmt: (v: number) => string,
): Promise<ExternalGatewayTreasury | null> {
  if (!businessDays || businessDays <= 0) return null;

  const tz = storeTimeZone ?? undefined;
  const slice = { start: since, end: new Date() };
  const orders = await Order.find(
    mergePaidOrderFilter({
      storeId,
      ...(tz ? orderDateMatchInTimezone(slice, tz) : orderDateMatch(slice)),
    }),
  )
    .select("orderDate totalPrice subtotal netRevenue refunded fees amountsBase")
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

    if (payoutKey > todayKey) {
      incoming += amount;
      incomingMap.set(payoutKey, (incomingMap.get(payoutKey) ?? 0) + amount);
    } else {
      received += amount;
      receivedMap.set(payoutKey, (receivedMap.get(payoutKey) ?? 0) + amount);
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
