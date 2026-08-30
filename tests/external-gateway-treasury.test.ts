import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXTERNAL_GATEWAY_PAYOUT_HOUR,
  isExternalGatewayPayoutReceived,
} from "../src/lib/external-gateway-treasury.ts";

describe("isExternalGatewayPayoutReceived", () => {
  const tz = "Europe/Amsterdam";

  it("marca como recebido em dias de payout anteriores", () => {
    assert.equal(
      isExternalGatewayPayoutReceived("2026-08-29", "2026-08-31", {
        timeZone: tz,
      }),
      true,
    );
    assert.equal(
      isExternalGatewayPayoutReceived("2026-08-30", "2026-08-31", {
        timeZone: tz,
      }),
      true,
    );
  });

  it("no dia de payout, só recebido após a hora típica (~07:00 fuso loja)", () => {
    const beforePayout = new Date("2026-08-31T04:30:00.000Z"); // 06:30 Amsterdam
    const afterPayout = new Date("2026-08-31T06:00:00.000Z"); // 08:00 Amsterdam (CEST)

    assert.equal(
      isExternalGatewayPayoutReceived("2026-08-31", "2026-08-31", {
        now: beforePayout,
        timeZone: tz,
      }),
      false,
    );
    assert.equal(
      isExternalGatewayPayoutReceived("2026-08-31", "2026-08-31", {
        now: afterPayout,
        timeZone: tz,
      }),
      true,
    );
    assert.equal(EXTERNAL_GATEWAY_PAYOUT_HOUR, 7);
  });

  it("mantém como a receber antes do dia útil de payout", () => {
    assert.equal(
      isExternalGatewayPayoutReceived("2026-09-01", "2026-08-31", {
        timeZone: tz,
      }),
      false,
    );
  });
});
