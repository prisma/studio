import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RelationLink } from "./Link";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  window.location.hash = "";
});

describe("RelationLink", () => {
  it("navigates on the first click without bubbling mouse down to the grid cell", () => {
    const onCellMouseDown = vi.fn();
    const onCellClick = vi.fn();
    const createUrl = vi.fn((values: Record<string, string>) => {
      return `#${new URLSearchParams(values).toString()}`;
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <table>
          <tbody>
            <tr>
              <td>
                <div
                  role="button"
                  tabIndex={-1}
                  onClick={onCellClick}
                  onKeyDown={() => {}}
                  onMouseDown={onCellMouseDown}
                >
                  <RelationLink
                    createUrl={createUrl}
                    filterColumn="organization_id"
                    filterValue="org_acme"
                    introspection={{
                      filterOperators: [],
                      query: {
                        parameters: [],
                        sql: "",
                      },
                      schemas: {
                        public: {
                          name: "public",
                          tables: {
                            team_members: {
                              columns: {},
                              name: "team_members",
                              schema: "public",
                            },
                          },
                        },
                      },
                      timezone: "UTC",
                    }}
                    targetSchema="public"
                    targetTable="team_members"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>,
      );
    });

    const link = container.querySelector("a");

    if (!(link instanceof HTMLAnchorElement)) {
      throw new Error("Could not find relation link");
    }

    act(() => {
      link.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
      link.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    });

    expect(onCellMouseDown).not.toHaveBeenCalled();
    expect(onCellClick).not.toHaveBeenCalled();
    expect(window.location.hash).toBe(createUrl.mock.results.at(-1)?.value);

    act(() => {
      root.unmount();
    });
  });
});
