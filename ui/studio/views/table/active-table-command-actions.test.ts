import { describe, expect, it, vi } from "vitest";

import { createActiveTableCommandPaletteActions } from "./active-table-command-actions";

describe("createActiveTableCommandPaletteActions", () => {
  it("switches search and AI commands between focus mode and direct-execute mode", async () => {
    const onFocusSearch = vi.fn();
    const onRunSearch = vi.fn();
    const onFocusFilterWithAi = vi.fn();
    const onRunFilterWithAi = vi.fn();
    const onSaveStagedChanges = vi.fn();
    const onDiscardStagedChanges = vi.fn();
    const onInsertRow = vi.fn();
    const onRefresh = vi.fn();
    const onGoToNextPage = vi.fn();
    const onGoToPreviousPage = vi.fn();
    const actions = createActiveTableCommandPaletteActions({
      canGoToNextPage: true,
      canGoToPreviousPage: false,
      hasAiFilter: true,
      hasStagedChanges: false,
      isInsertingDisabled: false,
      onDiscardStagedChanges,
      onFocusFilterWithAi,
      onFocusSearch,
      onGoToNextPage,
      onGoToPreviousPage,
      onInsertRow,
      onRefresh,
      onRunFilterWithAi,
      onRunSearch,
      onSaveStagedChanges,
      saveStagedChangesLabel: "Save 2 rows",
    });
    const searchFocusAction = actions.find(
      (action) => action.id === "table.search.focus",
    );
    const searchExecuteAction = actions.find(
      (action) => action.id === "table.search.execute",
    );
    const aiFocusAction = actions.find(
      (action) => action.id === "table.filter-with-ai.focus",
    );
    const aiExecuteAction = actions.find(
      (action) => action.id === "table.filter-with-ai.execute",
    );
    const nextPageAction = actions.find(
      (action) => action.id === "table.next-page",
    );
    const previousPageAction = actions.find(
      (action) => action.id === "table.previous-page",
    );

    expect(actions.map((action) => action.id)).toEqual([
      "table.search.focus",
      "table.search.execute",
      "table.filter-with-ai.focus",
      "table.filter-with-ai.execute",
      "table.insert-row",
      "table.refresh",
      "table.next-page",
      "table.previous-page",
    ]);
    expect(searchFocusAction?.shouldShow?.("")).toBe(true);
    expect(searchFocusAction?.shouldShow?.("se")).toBe(true);
    expect(searchFocusAction?.shouldShow?.("search rows")).toBe(true);
    expect(searchFocusAction?.shouldShow?.("karl")).toBe(false);
    expect(searchExecuteAction?.shouldShow?.("fi")).toBe(false);
    expect(searchExecuteAction?.shouldShow?.("karl")).toBe(true);
    expect(searchExecuteAction?.shouldShow?.("search rows")).toBe(false);
    expect(searchExecuteAction?.shouldShow?.("search rows karl")).toBe(true);
    expect(
      (searchExecuteAction?.label as (query: string) => string)("karl"),
    ).toBe("Search rows: karl");
    expect(
      (searchExecuteAction?.label as (query: string) => string)(
        "search rows karl",
      ),
    ).toBe("Search rows: karl");
    expect(aiFocusAction?.shouldShow?.("")).toBe(true);
    expect(aiFocusAction?.shouldShow?.("fi")).toBe(true);
    expect(aiFocusAction?.shouldShow?.("filter with ai")).toBe(true);
    expect(aiFocusAction?.shouldShow?.("top 5 users called Karl")).toBe(false);
    expect(aiExecuteAction?.shouldShow?.("se")).toBe(false);
    expect(aiExecuteAction?.shouldShow?.("top 5 users called Karl")).toBe(true);
    expect(aiExecuteAction?.shouldShow?.("filter with ai")).toBe(false);
    expect(aiExecuteAction?.label).toBeTypeOf("function");
    expect((aiExecuteAction?.label as (query: string) => string)("Karl")).toBe(
      "Filter with AI: Karl",
    );
    expect(nextPageAction?.disabled).toBe(false);
    expect(previousPageAction?.disabled).toBe(true);

    await searchFocusAction?.onSelect("se");
    await searchExecuteAction?.onSelect("search rows karl");
    await aiFocusAction?.onSelect("fil");
    await aiExecuteAction?.onSelect("top 5 users called Karl");
    await actions[4]?.onSelect("");
    await actions[5]?.onSelect("");
    await nextPageAction?.onSelect("");
    await previousPageAction?.onSelect("");

    expect(onFocusSearch).toHaveBeenCalledTimes(1);
    expect(onRunSearch).toHaveBeenCalledWith("karl");
    expect(onFocusFilterWithAi).toHaveBeenCalledTimes(1);
    expect(onRunFilterWithAi).toHaveBeenCalledWith("top 5 users called Karl");
    expect(onInsertRow).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onGoToNextPage).toHaveBeenCalledTimes(1);
    expect(onGoToPreviousPage).toHaveBeenCalledTimes(1);
    expect(onSaveStagedChanges).not.toHaveBeenCalled();
    expect(onDiscardStagedChanges).not.toHaveBeenCalled();
  });

  it("adds staged save and discard actions with the same toolbar wording", async () => {
    const onFocusSearch = vi.fn();
    const onRunSearch = vi.fn();
    const onFocusFilterWithAi = vi.fn();
    const onRunFilterWithAi = vi.fn();
    const onSaveStagedChanges = vi.fn();
    const onDiscardStagedChanges = vi.fn();
    const onInsertRow = vi.fn();
    const onRefresh = vi.fn();
    const onGoToNextPage = vi.fn();
    const onGoToPreviousPage = vi.fn();
    const actions = createActiveTableCommandPaletteActions({
      canGoToNextPage: true,
      canGoToPreviousPage: true,
      hasAiFilter: true,
      hasStagedChanges: true,
      isInsertingDisabled: false,
      onDiscardStagedChanges,
      onFocusFilterWithAi,
      onFocusSearch,
      onGoToNextPage,
      onGoToPreviousPage,
      onInsertRow,
      onRefresh,
      onRunFilterWithAi,
      onRunSearch,
      onSaveStagedChanges,
      saveStagedChangesLabel: "Save 2 rows",
    });

    expect(actions.map((action) => action.id)).toEqual([
      "table.search.focus",
      "table.search.execute",
      "table.filter-with-ai.focus",
      "table.filter-with-ai.execute",
      "table.save-staged-changes",
      "table.discard-staged-changes",
      "table.insert-row",
      "table.refresh",
      "table.next-page",
      "table.previous-page",
    ]);

    const saveAction = actions.find(
      (action) => action.id === "table.save-staged-changes",
    );
    const discardAction = actions.find(
      (action) => action.id === "table.discard-staged-changes",
    );

    expect(saveAction?.label).toBe("Save 2 rows");
    expect(discardAction?.label).toBe("Discard edits");

    await saveAction?.onSelect("");
    await discardAction?.onSelect("");

    expect(onSaveStagedChanges).toHaveBeenCalledTimes(1);
    expect(onDiscardStagedChanges).toHaveBeenCalledTimes(1);
  });
});
