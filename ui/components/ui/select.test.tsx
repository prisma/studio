import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("SelectContent", () => {
  it("uses the Studio sans font inside the portal", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <Select defaultOpen value="rows-desc">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rows-desc">Rows returned high to low</SelectItem>
          </SelectContent>
        </Select>,
      );

      await Promise.resolve();
    });

    expect(document.body.innerHTML).toContain("Rows returned high to low");
    expect(
      document.body.querySelector('[role="listbox"]')?.className,
    ).toContain("font-sans");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
