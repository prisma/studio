import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TemporalFailureInfo } from "@/data/temporal";

import { TemporalFailurePanel } from "./TemporalFailurePanel";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const cardExpired: TemporalFailureInfo = {
  isNonRetryable: true,
  message: "CardExpired: payment method card_expired_0005 expired",
  retryState: "NON_RETRYABLE_FAILURE",
  stackTrace: `ApplicationFailure: CardExpired: payment method card_expired_0005 expired
    at create (/mnt/app/code/bundle/node_modules/@temporalio/common/lib/failure.js:183:16)
    at chargeSubscription (/mnt/app/code/bundle/apps/shop/activities.ts:171:32)
    at async execute (/mnt/app/code/bundle/node_modules/@temporalio/worker/lib/activity.js:95:28)`,
  type: "CardExpired",
};

describe("TemporalFailurePanel", () => {
  let root: Root | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = "";
  });

  function render(failure: TemporalFailureInfo, attempt?: number) {
    const container = document.createElement("div");

    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root!.render(
        <TemporalFailurePanel attempt={attempt} failure={failure} />,
      ),
    );

    return container;
  }

  const text = (container: HTMLElement) =>
    container.textContent.replace(/\s+/g, " ");

  it("says what failed, where in the user's code, and why it was not retried, with the stack closed", () => {
    const container = render(cardExpired, 1);

    expect(text(container)).toContain("CardExpired");
    // The type is the title, so the message does not repeat it.
    expect(text(container)).toContain(
      "payment method card_expired_0005 expired",
    );
    expect(text(container)).not.toContain("CardExpired: payment");
    expect(text(container)).toContain(
      "Thrown inchargeSubscriptionapps/shop/activities.ts:171",
    );
    expect(text(container)).toContain(
      "Attempt 1. Not retried: the failure is marked non-retryable.",
    );
    // The frames are behind the Stack Trace button.
    expect(text(container)).toContain("3 frames, 2 in library code");
    expect(text(container)).not.toContain("failure.js");
  });

  it("opens the stack trace as a list of frames", () => {
    const container = render(cardExpired);
    const toggle = container.querySelector<HTMLElement>("[aria-expanded]")!;

    act(() => toggle.click());

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      [...container.querySelectorAll("ol > li")].map((item) =>
        item.textContent.replace(/\s+/g, " "),
      ),
    ).toEqual([
      "createcommon/lib/failure.js:183",
      "chargeSubscriptionapps/shop/activities.ts:171",
      "executeworker/lib/activity.js:95",
    ]);
  });

  it("shows the cause that holds the reason, and how the failure was reported", () => {
    const container = render({
      cause: cardExpired,
      message: "Activity task failed",
      retryState: "MAXIMUM_ATTEMPTS_REACHED",
    });

    expect(text(container)).toContain("CardExpired");
    expect(text(container)).toContain("Reported asActivity task failed");
    expect(text(container)).toContain(
      "Not retried: it reached the maximum number of attempts.",
    );
  });

  it("names a timeout by its kind and shows no stack section without a stack", () => {
    const container = render({
      message: "activity StartToClose timeout",
      timeoutType: "START_TO_CLOSE",
    });

    expect(text(container)).toContain("Start-To-Close Timeout");
    expect(container.querySelector("[aria-expanded]")).toBeNull();
  });
});
