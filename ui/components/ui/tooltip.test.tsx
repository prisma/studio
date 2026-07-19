import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("TooltipContent", () => {
  it("uses the Studio sans font inside the portal", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <TooltipProvider>
          <Tooltip defaultOpen>
            <TooltipTrigger asChild>
              <button type="button">Trigger</button>
            </TooltipTrigger>
            <TooltipContent>Tooltip copy</TooltipContent>
          </Tooltip>
        </TooltipProvider>,
      );

      await Promise.resolve();
    });

    expect(document.body.innerHTML).toContain("Tooltip copy");
    expect(document.body.innerHTML).toContain("font-sans");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
