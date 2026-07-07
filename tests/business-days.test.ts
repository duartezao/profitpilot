import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addBusinessDaysToDateKey } from "../src/lib/business-days.ts";
import { orderMerchantPayoutBase } from "../src/lib/order-merchant-payout.ts";

describe("addBusinessDaysToDateKey", () => {
  it("ignora fins de semana", () => {
    // Sexta 2026-07-03 + 1 dia útil = segunda 2026-07-06
    assert.equal(addBusinessDaysToDateKey("2026-07-03", 1), "2026-07-06");
  });

  it("soma vários dias úteis", () => {
    assert.equal(addBusinessDaysToDateKey("2026-07-06", 3), "2026-07-09");
  });

  it("zero dias devolve a mesma data", () => {
    assert.equal(addBusinessDaysToDateKey("2026-07-06", 0), "2026-07-06");
  });
});

describe("orderMerchantPayoutBase", () => {
  it("subtrai reembolsos e taxas do total", () => {
    const payout = orderMerchantPayoutBase({
      totalPrice: 100,
      refunded: 10,
      fees: 3,
      amountsBase: { refunded: 10, fees: 3 },
      netRevenue: 80,
    });
    assert.equal(payout, 87);
  });
});
