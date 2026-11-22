import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BinaryAlertDialog,
  type BinaryAlertDialogProps,
} from "./BinaryAlertDialog";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderDialog(overrides: Partial<BinaryAlertDialogProps> = {}) {
  const onOpenChange = vi.fn();
  const onPrimaryAction = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <BinaryAlertDialog
        onOpenChange={onOpenChange}
        onPrimaryAction={onPrimaryAction}
        open
        primaryLabel="delete"
        primaryVariant="destructive"
        prompt="Delete 2 rows?"
        secondaryLabel="keep"
        title="Confirm row deletion"
        {...overrides}
      />,
    );
  });

  const getButton = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === label,
    );
  const press = (key: string, init?: KeyboardEventInit) => {
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key,
          ...init,
        }),
      );
    });
  };

  return {
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
    getButton,
    onOpenChange,
    onPrimaryAction,
    press,
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("BinaryAlertDialog", () => {
  it("keeps the table-view behaviour: primary focused, arrows move, Enter activates the focused button", () => {
    const dialog = renderDialog();

    expect(document.body.textContent).toContain("Delete 2 rows?");
    expect(document.activeElement).toBe(dialog.getButton("delete"));

    dialog.press("Enter");
    expect(dialog.onPrimaryAction).toHaveBeenCalledTimes(1);

    dialog.press("ArrowRight");
    expect(document.activeElement).toBe(dialog.getButton("keep"));
    dialog.press("Enter");
    expect(dialog.onOpenChange).toHaveBeenCalledWith(false);
    expect(dialog.onPrimaryAction).toHaveBeenCalledTimes(1);

    dialog.cleanup();
  });

  it("closes on Escape without running the primary action", () => {
    const dialog = renderDialog();

    dialog.press("Escape");

    expect(dialog.onOpenChange).toHaveBeenCalledWith(false);
    expect(dialog.onPrimaryAction).not.toHaveBeenCalled();
    dialog.cleanup();
  });

  it("can focus the safe button first and render a control above the buttons", () => {
    const dialog = renderDialog({
      control: <p>extra content</p>,
      layout: "comfortable",
      initialFocus: "secondary",
    });

    expect(document.activeElement).toBe(dialog.getButton("keep"));
    expect(document.body.textContent).toContain("extra content");

    dialog.press("Enter", { metaKey: true });
    expect(dialog.onPrimaryAction).not.toHaveBeenCalled();
    expect(dialog.onOpenChange).toHaveBeenCalledWith(false);

    dialog.cleanup();
  });
});
