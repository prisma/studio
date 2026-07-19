import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { useUiState } from "./use-ui-state";

interface SearchControlUiState {
  isOpen: boolean;
}

export interface SearchControlSuggestion {
  annotation?: string | null;
  group?: string | null;
  id: string;
  label: string;
  value: string;
}

export interface SearchControlValidationState {
  isValid: boolean;
  message: string | null;
  shouldApply?: boolean;
}

export interface UseExpandableSearchControlArgs {
  applySearchValue: (value: string) => Promise<unknown> | unknown;
  canApplySearchValue?: (value: string) => boolean;
  freezeSuggestionsWhileOpen?: boolean;
  getSearchSuggestions?: (value: string) => SearchControlSuggestion[];
  scopeKey: string;
  searchTerm: string;
  supportsSearch: boolean;
  uiStateKeyPrefix: string;
  validateSearchValue?: (value: string) => SearchControlValidationState;
}

function areSearchSuggestionsEqual(
  left: SearchControlSuggestion[],
  right: SearchControlSuggestion[],
) {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((suggestion, index) => {
    const otherSuggestion = right[index];

    return (
      suggestion?.id === otherSuggestion?.id &&
      suggestion?.label === otherSuggestion?.label &&
      suggestion?.value === otherSuggestion?.value &&
      suggestion?.group === otherSuggestion?.group &&
      suggestion?.annotation === otherSuggestion?.annotation
    );
  });
}

export function useExpandableSearchControl(
  args: UseExpandableSearchControlArgs,
) {
  const {
    applySearchValue,
    canApplySearchValue,
    freezeSuggestionsWhileOpen = false,
    getSearchSuggestions,
    scopeKey,
    searchTerm,
    supportsSearch,
    uiStateKeyPrefix,
    validateSearchValue,
  } = args;
  const [searchUiState, setSearchUiState] = useUiState<SearchControlUiState>(
    supportsSearch ? `${uiStateKeyPrefix}:${scopeKey}` : undefined,
    {
      isOpen: searchTerm.length > 0,
    },
  );
  const [searchInput, setSearchInput] = useState(searchTerm);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const latestSearchInputRef = useRef(searchTerm);
  const isSearchOpen = supportsSearch && searchUiState.isOpen;
  const trimmedSearchInput = searchInput.trim();
  const searchValidation = (() => {
    if (trimmedSearchInput.length === 0) {
      return {
        isValid: true,
        message: null,
        shouldApply: true,
      } satisfies SearchControlValidationState;
    }

    if (validateSearchValue) {
      return validateSearchValue(trimmedSearchInput);
    }

    if (canApplySearchValue) {
      return {
        isValid: canApplySearchValue(trimmedSearchInput),
        message: null,
        shouldApply: canApplySearchValue(trimmedSearchInput),
      } satisfies SearchControlValidationState;
    }

    return {
      isValid: true,
      message: null,
      shouldApply: true,
    } satisfies SearchControlValidationState;
  })();
  const shouldApplySearchInput =
    searchValidation.shouldApply ?? searchValidation.isValid;
  const rawSearchSuggestions = useMemo(
    () =>
      supportsSearch && isSearchOpen && getSearchSuggestions
        ? getSearchSuggestions(searchInput)
        : [],
    [getSearchSuggestions, isSearchOpen, searchInput, supportsSearch],
  );
  const [searchSuggestions, setSearchSuggestions] = useState<
    SearchControlSuggestion[]
  >([]);
  const latestSuggestionInputRef = useRef(searchInput);
  const latestIsSearchOpenRef = useRef(isSearchOpen);

  useEffect(() => {
    latestSearchInputRef.current = searchInput;
  }, [searchInput]);

  useEffect(() => {
    const searchJustOpened = isSearchOpen && !latestIsSearchOpenRef.current;
    const searchInputChanged = latestSuggestionInputRef.current !== searchInput;

    if (!supportsSearch || !isSearchOpen || !getSearchSuggestions) {
      setSearchSuggestions((currentSuggestions) =>
        currentSuggestions.length === 0 ? currentSuggestions : [],
      );
      latestSuggestionInputRef.current = searchInput;
      latestIsSearchOpenRef.current = isSearchOpen;
      return;
    }

    if (!freezeSuggestionsWhileOpen || searchJustOpened || searchInputChanged) {
      setSearchSuggestions((currentSuggestions) =>
        areSearchSuggestionsEqual(currentSuggestions, rawSearchSuggestions)
          ? currentSuggestions
          : rawSearchSuggestions,
      );
    }

    latestSuggestionInputRef.current = searchInput;
    latestIsSearchOpenRef.current = isSearchOpen;
  }, [
    freezeSuggestionsWhileOpen,
    getSearchSuggestions,
    isSearchOpen,
    rawSearchSuggestions,
    searchInput,
    supportsSearch,
  ]);

  useEffect(() => {
    const latestSearchInput = latestSearchInputRef.current;

    if (
      latestSearchInput === searchTerm ||
      latestSearchInput.trim() === searchTerm
    ) {
      return;
    }

    setSearchInput(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    if (!supportsSearch) {
      return;
    }

    if (searchTerm.length > 0) {
      setSearchUiState({
        isOpen: true,
      });
    }
  }, [searchTerm, setSearchUiState, supportsSearch]);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }

    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, [isSearchOpen]);

  useEffect(() => {
    if (!supportsSearch || searchInput === searchTerm) {
      return;
    }

    const nextValue = trimmedSearchInput;

    if (!searchValidation.isValid || !shouldApplySearchInput) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void applySearchValue(nextValue);
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    applySearchValue,
    searchInput,
    searchValidation.isValid,
    searchTerm,
    shouldApplySearchInput,
    supportsSearch,
    trimmedSearchInput,
    validateSearchValue,
  ]);

  const closeSearch = useCallback(() => {
    searchInputRef.current?.blur();
    setSearchUiState({
      isOpen: false,
    });
    setSearchInput("");
    void applySearchValue("");
  }, [applySearchValue, setSearchUiState]);

  const openSearch = useCallback(() => {
    setSearchUiState({
      isOpen: true,
    });
  }, [setSearchUiState]);

  const runSearch = useCallback(
    (
      value: string,
      options?: { commitImmediately?: boolean; selectAll?: boolean },
    ) => {
      const nextValue = value.trim();

      const applyLocalSearchState = () => {
        setSearchUiState({
          isOpen: true,
        });
        setSearchInput(value);
      };

      if (options?.commitImmediately) {
        flushSync(() => {
          applyLocalSearchState();
        });
      } else {
        applyLocalSearchState();
      }

      const nextSearchValidation = validateSearchValue?.(nextValue) ?? {
        isValid: canApplySearchValue?.(nextValue) !== false,
        message: null,
        shouldApply: canApplySearchValue?.(nextValue) !== false,
      };

      if (
        nextValue.length === 0 ||
        (nextSearchValidation.isValid &&
          (nextSearchValidation.shouldApply ?? true))
      ) {
        void applySearchValue(nextValue);
      }

      requestAnimationFrame(() => {
        const inputElement = searchInputRef.current;

        inputElement?.focus();

        if (!inputElement) {
          return;
        }

        if (options?.selectAll === false) {
          const cursorIndex = inputElement.value.length;

          inputElement.setSelectionRange(cursorIndex, cursorIndex);
          return;
        }

        inputElement.select();
      });
    },
    [
      applySearchValue,
      canApplySearchValue,
      setSearchUiState,
      validateSearchValue,
    ],
  );

  return {
    acceptSearchSuggestion: (value: string) =>
      runSearch(value, {
        commitImmediately: true,
        selectAll: false,
      }),
    closeRowSearch: closeSearch,
    isRowSearchOpen: isSearchOpen,
    isSearchInputInvalid: !searchValidation.isValid,
    openRowSearch: openSearch,
    rowSearchInputRef: searchInputRef,
    runRowSearch: runSearch,
    searchSuggestions,
    searchValidationMessage: searchValidation.message,
    searchInput,
    setSearchInput,
  };
}
