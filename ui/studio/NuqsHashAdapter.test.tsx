import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useQueryState } from "../hooks/nuqs";
import { NuqsHashAdapter } from "./NuqsHashAdapter";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function waitFor(assertion: () => boolean): Promise<void> {
  const timeoutMs = 2000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (assertion()) {
      return;
    }

    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }

  throw new Error("Timed out waiting for hash adapter update");
}

describe("NuqsHashAdapter", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "#");
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps query state in sync with hash updates", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    let setValueRef:
      | ((value: string | null) => Promise<URLSearchParams>)
      | undefined;

    function Harness() {
      const [value, setValue] = useQueryState("test", {
        defaultValue: "alpha",
      });
      setValueRef = setValue;

      return (
        <button
          type="button"
          onClick={() => {
            void setValueRef?.("beta");
          }}
        >
          {value}
        </button>
      );
    }

    act(() => {
      root.render(
        <NuqsHashAdapter>
          <Harness />
        </NuqsHashAdapter>,
      );
    });

    const button = container.querySelector("button");

    expect(button?.textContent).toBe("alpha");

    await act(async () => {
      await setValueRef?.("beta");
    });

    await waitFor(() => window.location.hash.includes("test=beta"));
    await waitFor(() => button?.textContent === "beta");

    expect(button?.textContent).toBe("beta");

    act(() => {
      window.history.replaceState(null, "", "#test=gamma");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await waitFor(() => button?.textContent === "gamma");

    expect(button?.textContent).toBe("gamma");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
