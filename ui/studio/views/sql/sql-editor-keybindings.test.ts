import { describe, expect, it, vi } from "vitest";

import { createSqlEditorKeybindings } from "./sql-editor-keybindings";

describe("sql-editor-keybindings", () => {
  it("registers Mod-Enter and triggers SQL execution when invoked", () => {
    const runSql = vi.fn();
    const bindings = createSqlEditorKeybindings({ runSql });
    const modEnter = bindings.find((binding) => binding.key === "Mod-Enter");

    if (!modEnter?.run) {
      throw new Error("Expected Mod-Enter binding with run handler");
    }

    expect(modEnter.run({} as never)).toBe(true);
    expect(runSql).toHaveBeenCalledTimes(1);
  });
});
