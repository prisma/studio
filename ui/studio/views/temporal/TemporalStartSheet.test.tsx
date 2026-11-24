import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  TemporalFacets,
  TemporalTypeInputsResponse,
} from "@/data/temporal";

import {
  type TemporalStartPreset,
  TemporalStartSheet,
} from "./TemporalStartSheet";

const mutateAsync = vi.fn(() =>
  Promise.resolve({ runId: "run-new", workflowId: "started" }),
);
const typeInputsArgs =
  vi.fn<(args: { enabled: boolean; workflowType: string }) => void>();

const inputs: Record<string, TemporalTypeInputsResponse> = {
  orderFulfillment: {
    runs: [
      {
        args: [{ $encodedPayload: { encoding: "binary/encrypted" } }],
        isEncoded: true,
        runId: "run-9",
        startTime: "2026-11-23T12:00:00.000Z",
        status: "Running",
        taskQueue: "orders",
        workflowId: "order-9",
      },
      {
        args: [{ orderId: "ord_8", plan: "pro" }],
        isEncoded: false,
        runId: "run-8",
        startTime: "2026-11-23T11:00:00.000Z",
        status: "Completed",
        taskQueue: "orders",
        workflowId: "order-8",
      },
      {
        args: [{ orderId: "ord_7", plan: "starter" }],
        isEncoded: false,
        runId: "run-7",
        startTime: "2026-11-23T10:00:00.000Z",
        status: "Failed",
        taskQueue: "orders",
        workflowId: "order-7",
      },
    ],
    taskQueue: "orders",
  },
  subscriptionBilling: {
    runs: [
      {
        args: [{ customerId: "cus_1" }],
        isEncoded: false,
        runId: "run-s1",
        startTime: "2026-11-23T09:00:00.000Z",
        status: "Running",
        taskQueue: "billing",
        workflowId: "sub-1",
      },
    ],
    taskQueue: "billing",
  },
};

vi.mock("@/ui/hooks/use-temporal", () => ({
  useTemporalActions: () => ({
    startWorkflow: { isPending: false, mutateAsync },
  }),
  useTemporalTypeInputs: (args: { enabled: boolean; workflowType: string }) => {
    typeInputsArgs(args);

    return {
      data: args.enabled ? inputs[args.workflowType] : undefined,
      isLoading: false,
    };
  },
}));

// The real editor needs a browser's layout; a text area holds the same text.
vi.mock("./TemporalJsonEditor", () => ({
  TemporalJsonEditor: (props: {
    id: string;
    onChange: (value: string) => void;
    value: string;
  }) => (
    <textarea
      id={props.id}
      onChange={(event) => props.onChange(event.target.value)}
      value={props.value}
    />
  ),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const facets: TemporalFacets = {
  complete: true,
  searchAttributes: [],
  taskQueues: [
    { count: 400, name: "billing" },
    { count: 300, name: "orders" },
  ],
  workflowTypes: [
    {
      count: 400,
      latestRun: { runId: "r", workflowId: "w" },
      name: "orderFulfillment",
    },
    {
      count: 160,
      latestRun: { runId: "r", workflowId: "w" },
      name: "subscriptionBilling",
    },
  ],
};

describe("TemporalStartSheet", () => {
  let root: Root | undefined;
  const onStarted = vi.fn();

  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  function render(
    currentFacets: TemporalFacets = facets,
    sheet: { open?: boolean; preset?: TemporalStartPreset } = {},
  ) {
    if (!root) {
      const container = document.createElement("div");

      document.body.append(container);
      root = createRoot(container);
    }

    act(() =>
      root!.render(
        <TemporalStartSheet
          facets={currentFacets}
          namespace="default"
          onOpenChange={vi.fn()}
          onStarted={onStarted}
          open={sheet.open ?? true}
          preset={sheet.preset}
        />,
      ),
    );
  }

  const field = (id: string) =>
    document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement;

  function type(id: string, text: string) {
    const element = field(id);
    const setValue = Object.getOwnPropertyDescriptor(
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )!.set!;

    act(() => {
      setValue.call(element, text);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  const notes = () =>
    document
      .querySelector('[data-testid="temporal-start-input-notes"]')!
      .textContent.replace(/\s+/g, " ");

  it("starts empty and asks for a Workflow Type", () => {
    render();

    expect(field("temporal-start-type").value).toBe("");
    expect(
      document.querySelector<HTMLButtonElement>(
        '[data-testid="temporal-start-submit"]',
      )!.disabled,
    ).toBe(true);
    expect(document.body.textContent).toContain("Choose a Workflow Type.");
  });

  it("fills in the queue, the ID and the newest readable input once a type is chosen", () => {
    render();
    type("temporal-start-type", "orderFulfillment");

    expect(field("temporal-start-queue").value).toBe("orders");
    expect(field("temporal-start-id").value).toMatch(
      /^order-fulfillment-[a-z0-9]+$/,
    );
    // The newest run's input is encoded, so the form takes the next one, which completed.
    expect(JSON.parse(field("temporal-start-args").value)).toEqual([
      { orderId: "ord_8", plan: "pro" },
    ]);
    expect(notes()).toContain("The input of the newest completed run, order-8");
  });

  it("does not ask the server about a name that is still being typed", () => {
    render();
    type("temporal-start-type", "orderFul");

    expect(typeInputsArgs).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    );
    expect(
      document.querySelector('[data-testid="temporal-start-type-note"]')!
        .textContent,
    ).toContain("No run of this type yet");
  });

  it("keeps what the user typed when the list of known types is read again", () => {
    render();
    type("temporal-start-type", "orderFulfillment");
    type("temporal-start-queue", "orders-canary");
    type("temporal-start-args", '[{"orderId": "ord_mine"}]');

    // A refresh of the facets gives the form a new object with the same content.
    render(structuredClone(facets));

    expect(field("temporal-start-type").value).toBe("orderFulfillment");
    expect(field("temporal-start-queue").value).toBe("orders-canary");
    expect(field("temporal-start-args").value).toBe(
      '[{"orderId": "ord_mine"}]',
    );
  });

  it("replaces an input it filled in when the type changes, and keeps one the user wrote", () => {
    render();
    type("temporal-start-type", "orderFulfillment");
    type("temporal-start-type", "subscriptionBilling");

    expect(JSON.parse(field("temporal-start-args").value)).toEqual([
      { customerId: "cus_1" },
    ]);
    expect(field("temporal-start-queue").value).toBe("billing");

    type("temporal-start-args", '[{"customerId": "cus_mine"}]');
    type("temporal-start-type", "orderFulfillment");

    expect(field("temporal-start-args").value).toBe(
      '[{"customerId": "cus_mine"}]',
    );
  });

  it("keeps the input of a cloned run when the form was filled from another run before", () => {
    render();
    type("temporal-start-type", "orderFulfillment");
    render(facets, { open: false });
    render(facets, {
      preset: {
        args: [{ orderId: "ord_cloned" }],
        clonedFromWorkflowId: "order-3",
        taskQueue: "orders-canary",
        workflowType: "orderFulfillment",
      },
    });

    expect(JSON.parse(field("temporal-start-args").value)).toEqual([
      { orderId: "ord_cloned" },
    ]);
    expect(field("temporal-start-queue").value).toBe("orders-canary");
    expect(field("temporal-start-id").value).toMatch(/^order-3-retry-/);
    expect(notes()).not.toContain("input of");
  });

  it("names a key that every recent run passes and the input lacks", () => {
    render();
    type("temporal-start-type", "orderFulfillment");
    type("temporal-start-args", '[{"orderId": "ord_1", "plam": "pro"}]');

    expect(notes()).toContain("Every recent run also passes plan.");
    expect(notes()).toContain("No recent run passes plam.");
  });

  it("starts the run with the values in the form", async () => {
    render();
    type("temporal-start-type", "orderFulfillment");
    type("temporal-start-id", "order-mine");

    await act(async () => {
      document
        .querySelector<HTMLElement>('[data-testid="temporal-start-submit"]')!
        .click();
      await Promise.resolve();
    });

    expect(mutateAsync).toHaveBeenCalledWith({
      args: [{ orderId: "ord_8", plan: "pro" }],
      idReusePolicy: "ALLOW_DUPLICATE",
      taskQueue: "orders",
      workflowId: "order-mine",
      workflowType: "orderFulfillment",
    });
    expect(onStarted).toHaveBeenCalledWith("started", "run-new");
  });

  it("keeps the reason of a failed start in the form, and the form as it was", async () => {
    mutateAsync.mockRejectedValueOnce(
      new Error("Workflow execution is already running."),
    );
    render();
    type("temporal-start-type", "orderFulfillment");
    type("temporal-start-id", "order-mine");

    await act(async () => {
      document
        .querySelector<HTMLElement>('[data-testid="temporal-start-submit"]')!
        .click();
      await Promise.resolve();
    });

    const error = document.querySelector(
      '[data-testid="temporal-start-error"]',
    )!;

    expect(error.getAttribute("role")).toBe("alert");
    expect(error.textContent).toContain(
      "Workflow execution is already running.",
    );
    expect(field("temporal-start-id").value).toBe("order-mine");
    expect(onStarted).not.toHaveBeenCalled();
  });

  it("starts on Cmd+Enter while the ID Reuse Policy has the focus, without opening its list", async () => {
    render();
    type("temporal-start-type", "orderFulfillment");

    await act(async () => {
      document.getElementById("temporal-start-reuse")!.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
          metaKey: true,
        }),
      );
      await Promise.resolve();
    });

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(
      document
        .getElementById("temporal-start-reuse")!
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });
});
