import { describe, expect, it } from "vitest";

import {
  describeRetryState,
  failureOrigin,
  parseStackTrace,
  shortenPath,
} from "./failure";

const typeScriptStack = `ApplicationFailure: CardExpired: payment method card_expired_0005 expired
    at create (/mnt/app/code/bundle/node_modules/@temporalio/common/lib/failure.js:183:16)
    at chargeSubscription (/mnt/app/code/bundle/apps/shop/activities.ts:171:32)
    at async execute (/mnt/app/code/bundle/node_modules/@temporalio/worker/lib/activity.js:95:28)`;

describe("parseStackTrace", () => {
  it("reads the frames of a TypeScript stack and leaves the message line out", () => {
    const frames = parseStackTrace(typeScriptStack);

    expect(
      frames.map((frame) => [frame.functionName, frame.line, frame.isLibrary]),
    ).toEqual([
      ["create", 183, true],
      ["chargeSubscription", 171, false],
      ["execute", 95, true],
    ]);
    expect(frames[1]).toMatchObject({
      column: 32,
      file: "/mnt/app/code/bundle/apps/shop/activities.ts",
    });
  });

  it("reads Python, Java and Go frames", () => {
    expect(
      parseStackTrace(
        '  File "/app/activities.py", line 42, in charge_subscription',
      )[0],
    ).toMatchObject({
      file: "/app/activities.py",
      functionName: "charge_subscription",
      isLibrary: false,
      line: 42,
    });
    expect(
      parseStackTrace(
        "at com.shop.Billing.charge(Billing.java:57)\nat io.temporal.internal.Worker.run(Worker.java:9)",
      ).map((frame) => [frame.functionName, frame.line, frame.isLibrary]),
    ).toEqual([
      ["com.shop.Billing.charge", 57, false],
      ["io.temporal.internal.Worker.run", 9, true],
    ]);
    expect(
      parseStackTrace(
        "shop/billing.ChargeSubscription(0xc000, 0x1)\n\t/src/shop/billing/charge.go:88 +0x1a5",
      )[0],
    ).toMatchObject({
      file: "/src/shop/billing/charge.go",
      functionName: "shop/billing.ChargeSubscription",
      line: 88,
    });
  });

  it("returns no frames for a failure without a stack", () => {
    expect(parseStackTrace(undefined)).toEqual([]);
    expect(parseStackTrace("just a message")).toEqual([]);
  });
});

describe("failureOrigin", () => {
  it("names the first frame in the user's own code, from the cause that holds the reason", () => {
    expect(
      failureOrigin({
        cause: { message: "expired", stackTrace: typeScriptStack },
        message: "Activity task failed",
      }),
    ).toMatchObject({ functionName: "chargeSubscription", line: 171 });
  });

  it("names nothing when every frame is library code", () => {
    expect(
      failureOrigin({
        message: "timeout",
        stackTrace:
          "at run (/app/node_modules/@temporalio/worker/lib/worker.js:1:2)",
      }),
    ).toBeNull();
  });
});

describe("shortenPath", () => {
  it("keeps the last parts of a path", () => {
    expect(shortenPath("/mnt/app/code/bundle/apps/shop/activities.ts")).toBe(
      "apps/shop/activities.ts",
    );
    expect(shortenPath("activities.ts")).toBe("activities.ts");
  });
});

describe("describeRetryState", () => {
  it("says why a failed Activity was not retried", () => {
    expect(describeRetryState("NON_RETRYABLE_FAILURE")).toBe(
      "Not retried: the failure is marked non-retryable.",
    );
    expect(describeRetryState(undefined)).toBeUndefined();
  });
});
