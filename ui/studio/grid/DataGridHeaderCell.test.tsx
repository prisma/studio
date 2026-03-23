import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { Column } from "../../../data/adapter";
import { DataGridHeaderCell } from "./DataGridHeaderCell";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DataGridHeaderCell", () => {
  it("keeps header content shrinkable so narrow columns clip instead of forcing width", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <DataGridHeaderCell
          column={
            {
              datatype: {
                affinity: "character varying",
                name: "varchar",
              },
              isRequired: true,
              name: "very_long_header_name",
            } as Column
          }
        />,
      );
    });

    const contentRow = container.querySelector("div");
    const textNodes = Array.from(container.querySelectorAll("span"));
    const name = textNodes.find((node) =>
      node.textContent?.includes("very_long_header_name"),
    );
    const type = textNodes.find((node) =>
      node.textContent?.includes("character varying"),
    );

    expect(contentRow?.className).toContain("min-w-0");
    expect(contentRow?.className).toContain("overflow-hidden");
    expect(name?.className).toContain("min-w-0");
    expect(name?.className).toContain("truncate");
    expect(type?.className).toContain("min-w-0");
    expect(type?.className).toContain("truncate");

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("wraps tooltip icons in trigger spans instead of rendering raw svg triggers", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <DataGridHeaderCell
          column={
            {
              datatype: {
                affinity: "uuid",
                name: "uuid",
              },
              fkColumn: "id",
              fkSchema: "public",
              fkTable: "accounts",
              isAutoincrement: true,
              isComputed: true,
              isRequired: true,
              name: "account_id",
              pkPosition: 1,
            } as Column
          }
        />,
      );
    });

    const iconSvgs = Array.from(container.querySelectorAll("svg"));
    const wrappedTriggerSpans = iconSvgs.filter(
      (svg) =>
        svg.parentElement instanceof HTMLSpanElement &&
        svg.parentElement.className.includes("inline-flex"),
    );

    expect(iconSvgs).toHaveLength(5);
    expect(wrappedTriggerSpans).toHaveLength(5);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
