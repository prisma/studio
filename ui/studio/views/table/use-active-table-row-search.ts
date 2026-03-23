import { useCallback, useEffect, useRef, useState } from "react";

import { useUiState } from "../../../hooks/use-ui-state";

interface UseActiveTableRowSearchArgs {
  scopeKey: string;
  searchTerm: string;
  setPageIndexParam: (value: string) => Promise<URLSearchParams>;
  setSearchParam: (value: string) => Promise<URLSearchParams>;
  supportsFullTableSearch: boolean;
}

interface RowSearchUiState {
  isOpen: boolean;
}

export function useActiveTableRowSearch(args: UseActiveTableRowSearchArgs) {
  const {
    scopeKey,
    searchTerm,
    setPageIndexParam,
    setSearchParam,
    supportsFullTableSearch,
  } = args;
  const [rowSearchUiState, setRowSearchUiState] = useUiState<RowSearchUiState>(
    supportsFullTableSearch ? `table-row-search:${scopeKey}` : undefined,
    {
      isOpen: searchTerm.length > 0,
    },
  );
  const [searchInput, setSearchInput] = useState(searchTerm);
  const rowSearchInputRef = useRef<HTMLInputElement | null>(null);
  const isRowSearchOpen = supportsFullTableSearch && rowSearchUiState.isOpen;

  useEffect(() => {
    setSearchInput(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    if (!supportsFullTableSearch) {
      setRowSearchUiState({
        isOpen: false,
      });
      return;
    }

    if (searchTerm.length > 0) {
      setRowSearchUiState({
        isOpen: true,
      });
    }
  }, [searchTerm, setRowSearchUiState, supportsFullTableSearch]);

  useEffect(() => {
    if (!isRowSearchOpen) {
      return;
    }

    rowSearchInputRef.current?.focus();
    rowSearchInputRef.current?.select();
  }, [isRowSearchOpen]);

  useEffect(() => {
    if (!supportsFullTableSearch || searchInput === searchTerm) {
      return;
    }

    const timeout = setTimeout(() => {
      void setSearchParam(searchInput);
      void setPageIndexParam("0");
    }, 350);

    return () => clearTimeout(timeout);
  }, [
    searchInput,
    searchTerm,
    setPageIndexParam,
    setSearchParam,
    supportsFullTableSearch,
  ]);

  const closeRowSearch = useCallback(() => {
    rowSearchInputRef.current?.blur();
    setRowSearchUiState({
      isOpen: false,
    });
    setSearchInput("");
    void setSearchParam("");
    void setPageIndexParam("0");
  }, [setPageIndexParam, setRowSearchUiState, setSearchParam]);

  const openRowSearch = useCallback(() => {
    setRowSearchUiState({
      isOpen: true,
    });
  }, [setRowSearchUiState]);

  const runRowSearch = useCallback(
    (value: string) => {
      const nextValue = value.trim();

      setRowSearchUiState({
        isOpen: true,
      });
      setSearchInput(nextValue);
      void setSearchParam(nextValue);
      void setPageIndexParam("0");

      requestAnimationFrame(() => {
        rowSearchInputRef.current?.focus();
        rowSearchInputRef.current?.select();
      });
    },
    [setPageIndexParam, setRowSearchUiState, setSearchParam],
  );

  return {
    closeRowSearch,
    isRowSearchOpen,
    openRowSearch,
    rowSearchInputRef,
    runRowSearch,
    searchInput,
    setSearchInput,
  };
}
