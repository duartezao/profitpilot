import "server-only";
import type { Types } from "mongoose";
import { Order } from "@/models/Order";
import { Store } from "@/models/Store";
import { mergePaidOrderFilter } from "@/lib/order-financial-status";
import { sessionCountryKeysFromStore } from "@/lib/shopify-countries";
import {
  dateKeyInTimezone,
  normalizeStoreTimezone,
} from "@/lib/store-timezone";
import {
  cogsModeForSessionCountries,
  assimilatesCogsOnSync,
  isCogsMode,
  type CogsMode,
} from "@/lib/cogs-modes";

/**
 * Há encomenda paga cujo país de envio é um dos países de sessões
 * que não é o primeiro (mercado «principal» do automático).
 */
export async function hasOrdersInSecondarySessionCountry(
  storeId: Types.ObjectId | string,
  countries: string[],
): Promise<boolean> {
  if (countries.length <= 1) return false;
  const secondary = countries.slice(1);
  if (!secondary.length) return false;

  const hit = await Order.exists(
    mergePaidOrderFilter({
      storeId,
      shippingCountryCode: { $in: secondary },
    }),
  );
  return Boolean(hit);
}

/** Data (fuso da loja) da primeira encomenda paga noutro país de sessões. */
export async function firstSecondarySessionOrderDateKey(
  storeId: Types.ObjectId | string,
  countries: string[],
  storeTimeZone?: string | null,
): Promise<string | null> {
  if (countries.length <= 1) return null;
  const secondary = countries.slice(1);
  if (!secondary.length) return null;

  const order = await Order.findOne(
    mergePaidOrderFilter({
      storeId,
      shippingCountryCode: { $in: secondary },
    }),
  )
    .sort({ orderDate: 1 })
    .select("orderDate")
    .lean();

  if (!order?.orderDate) return null;
  return dateKeyInTimezone(
    new Date(order.orderDate),
    normalizeStoreTimezone(storeTimeZone),
  );
}

/** Resolve modo COGS: só força `day` com 2+ países E order noutro país de sessões. */
export async function resolveCogsModeForStoreSessionCountries(
  storeId: Types.ObjectId | string,
  countries: string[],
  current?: CogsMode | null,
): Promise<{ mode: CogsMode; forceDay: boolean; cogsDayFromKey: string | null }> {
  const store = await Store.findById(storeId)
    .select("ianaTimezone")
    .lean();
  const fromKey = await firstSecondarySessionOrderDateKey(
    storeId,
    countries,
    store?.ianaTimezone,
  );
  const forceDay = Boolean(fromKey);
  return {
    mode: cogsModeForSessionCountries(countries, current, { forceDay }),
    forceDay,
    cogsDayFromKey: fromKey,
  };
}

/**
 * Após sync: se há order noutro país de sessões, a partir dessa data
 * o COGS passa a `day`. Histórico automático mantém-se (cogsDayFromKey).
 */
export async function enforceDayCogsIfSecondarySessionOrders(
  storeId: string,
): Promise<boolean> {
  const store = await Store.findById(storeId)
    .select(
      "analyticsSessionCountries analyticsSessionCountry cogsMode cogsDayFromKey cogsModePriorToDayForce ianaTimezone",
    )
    .lean();
  if (!store) return false;

  const countries = sessionCountryKeysFromStore(store);
  if (countries.length <= 1) return false;

  const fromKey = await firstSecondarySessionOrderDateKey(
    store._id,
    countries,
    store.ianaTimezone,
  );
  if (!fromKey) return false;

  const current = (store.cogsMode ?? "shopify") as CogsMode;
  const alreadyDay = current === "day";
  const alreadyKeyed =
    typeof store.cogsDayFromKey === "string" && store.cogsDayFromKey.length > 0;

  // Já cortado — não recuar a data (manter a 1ª order)
  if (alreadyDay && alreadyKeyed) return false;

  if (
    !alreadyDay &&
    !assimilatesCogsOnSync(current) &&
    current !== "order"
  ) {
    return false;
  }

  const prior =
    store.cogsModePriorToDayForce &&
    isCogsMode(String(store.cogsModePriorToDayForce))
      ? (store.cogsModePriorToDayForce as CogsMode)
      : current === "day"
        ? "shopify"
        : current;

  await Store.updateOne(
    { _id: store._id },
    {
      $set: {
        cogsMode: "day",
        cogsDayFromKey: alreadyKeyed ? store.cogsDayFromKey : fromKey,
        ...(store.cogsModePriorToDayForce
          ? {}
          : { cogsModePriorToDayForce: prior }),
      },
    },
  );
  return true;
}
