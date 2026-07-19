import { useEffect, useLayoutEffect, useMemo, useRef } from "react";

/**
 * Theme variables type - matches shadcn format
 */
export type ThemeVariables = Record<string, string>;

/**
 * Custom theme configuration with light and dark variants
 */
export interface CustomTheme {
  light: ThemeVariables;
  dark: ThemeVariables;
}

/**
 * Parse CSS variables from shadcn format CSS string
 * Handles both :root and .dark selectors
 */
export function parseThemeFromCSS(cssString: string): CustomTheme | null {
  try {
    const theme: CustomTheme = { light: {}, dark: {} };

    // Remove @layer base wrapper if present
    const cleanCss = cssString.replace(/@layer\s+base\s*\{|\}$/g, "").trim();

    // Split by selectors
    const rootMatch = cleanCss.match(/:root\s*\{([^}]+)\}/);
    const darkMatch = cleanCss.match(/\.dark\s*\{([^}]+)\}/);

    if (rootMatch && rootMatch[1]) {
      theme.light = parseVariables(rootMatch[1]);
    }

    if (darkMatch && darkMatch[1]) {
      theme.dark = parseVariables(darkMatch[1]);
    }

    // Return null if no valid theme found
    if (
      Object.keys(theme.light).length === 0 &&
      Object.keys(theme.dark).length === 0
    ) {
      return null;
    }

    return theme;
  } catch {
    return null;
  }
}

/**
 * Parse CSS variables from a CSS block content
 */
function parseVariables(cssContent: string): ThemeVariables {
  const variables: ThemeVariables = {};

  const variableRegex = /--([\w-]+):\s*([^;]+);?/g;
  let match;

  while ((match = variableRegex.exec(cssContent)) !== null) {
    const [, name, value] = match;
    if (name && value) {
      variables[`--${name}`] = value.trim();
    }
  }

  return variables;
}

/**
 * Resolve every Studio-scoped root, including portal wrappers.
 */
function getStudioRoots(): HTMLElement[] {
  if (typeof document === "undefined") {
    return [];
  }

  return Array.from(document.querySelectorAll<HTMLElement>(".ps"));
}

/**
 * Apply theme variables to every Studio root.
 */
export function applyThemeVariables(variables: ThemeVariables): void {
  const roots = getStudioRoots();

  for (const root of roots) {
    Object.entries(variables).forEach(([property, value]) => {
      root.style.setProperty(property, value);
    });
  }
}

/**
 * Clear theme variables from every Studio root.
 */
export function clearThemeVariables(variableNames: Iterable<string>): void {
  const roots = getStudioRoots();

  for (const root of roots) {
    for (const variableName of variableNames) {
      root.style.removeProperty(variableName);
    }
  }
}

/**
 * Marker attribute set on `<html>` when Studio owns the document background.
 */
export const STUDIO_DOCUMENT_THEME_ATTRIBUTE = "data-prisma-studio-theme";

function hasAuthoredBackground(element: Element): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.getComputedStyle !== "function"
  ) {
    return false;
  }

  const style = window.getComputedStyle(element);
  const backgroundColor = style.backgroundColor;
  const hasBackgroundColor =
    backgroundColor !== "" &&
    backgroundColor !== "transparent" &&
    backgroundColor !== "rgba(0, 0, 0, 0)";
  const backgroundImage = style.backgroundImage;
  const hasBackgroundImage =
    backgroundImage !== "" && backgroundImage !== "none";

  return hasBackgroundColor || hasBackgroundImage;
}

interface DocumentThemeInlineValues {
  backgroundColor: string;
  colorScheme: string;
}

interface DocumentThemeClaim {
  /**
   * Inline `<html>` values that were present before Studio claimed the
   * document, restored when the claim is released.
   */
  original: DocumentThemeInlineValues;
  /**
   * Inline `<html>` values Studio last applied. If the current inline values
   * differ, the host mutated them after Studio's claim and wins.
   */
  applied: DocumentThemeInlineValues;
}

/**
 * `useTheme` instances that currently participate in document-level theming.
 * The document theme is only released once the last instance unmounts.
 */
const documentThemeOwners = new Set<object>();

let documentThemeClaim: DocumentThemeClaim | null = null;

function readDocumentThemeInlineValues(
  documentElement: HTMLElement,
): DocumentThemeInlineValues {
  return {
    backgroundColor: documentElement.style.getPropertyValue("background-color"),
    colorScheme: documentElement.style.getPropertyValue("color-scheme"),
  };
}

function setInlinePropertyOrRemove(
  documentElement: HTMLElement,
  property: string,
  value: string,
): void {
  if (value === "") {
    documentElement.style.removeProperty(property);
  } else {
    documentElement.style.setProperty(property, value);
  }
}

function restoreDocumentThemeInlineValues(
  documentElement: HTMLElement,
  values: DocumentThemeInlineValues,
): void {
  setInlinePropertyOrRemove(
    documentElement,
    "background-color",
    values.backgroundColor,
  );
  setInlinePropertyOrRemove(
    documentElement,
    "color-scheme",
    values.colorScheme,
  );
}

function releaseDocumentThemeClaim(documentElement: HTMLElement): void {
  documentElement.removeAttribute(STUDIO_DOCUMENT_THEME_ATTRIBUTE);
  documentThemeClaim = null;
}

/**
 * Sync the resolved Studio theme to the document root so overscroll areas and
 * the space behind Studio's rounded corners match the active theme.
 *
 * Studio may only paint the page canvas when no host styling claimed it.
 * Embedded hosts (Console, arbitrary web apps) style `<html>`/`<body>`
 * themselves, so Studio must leave their document untouched. Full-page
 * shells that ship an unstyled document (the default-white overscroll and
 * behind-border-radius areas from prisma/studio#1475) are safe to claim.
 * Host ownership is re-evaluated on every sync (ignoring the inline values
 * Studio applied itself), so a host that starts styling the document after
 * Studio mounted takes over and Studio restores what it changed.
 */
export function syncDocumentTheme(args: {
  isDarkMode: boolean;
  owner: object;
  studioRoot: HTMLElement | null;
}): void {
  if (typeof document === "undefined") {
    return;
  }

  const { isDarkMode, owner, studioRoot } = args;

  documentThemeOwners.add(owner);

  const documentElement = document.documentElement;

  if (
    documentThemeClaim &&
    !documentElement.hasAttribute(STUDIO_DOCUMENT_THEME_ATTRIBUTE)
  ) {
    // External code stripped Studio's marker; treat the claim as released.
    documentThemeClaim = null;
  }

  if (documentThemeClaim) {
    const inlineValues = readDocumentThemeInlineValues(documentElement);
    const backgroundHijacked =
      inlineValues.backgroundColor !==
      documentThemeClaim.applied.backgroundColor;
    const colorSchemeHijacked =
      inlineValues.colorScheme !== documentThemeClaim.applied.colorScheme;

    if (backgroundHijacked || colorSchemeHijacked) {
      // The host took inline control after Studio's claim. Keep the host's
      // values and only restore the properties Studio still controlled.
      if (!backgroundHijacked) {
        setInlinePropertyOrRemove(
          documentElement,
          "background-color",
          documentThemeClaim.original.backgroundColor,
        );
      }

      if (!colorSchemeHijacked) {
        setInlinePropertyOrRemove(
          documentElement,
          "color-scheme",
          documentThemeClaim.original.colorScheme,
        );
      }

      releaseDocumentThemeClaim(documentElement);
      return;
    }

    // Judge host-authored backgrounds without Studio's own inline values.
    restoreDocumentThemeInlineValues(
      documentElement,
      documentThemeClaim.original,
    );
  }

  const body = document.body;
  const hostOwnsBackground =
    hasAuthoredBackground(documentElement) ||
    (body != null && hasAuthoredBackground(body));

  if (hostOwnsBackground) {
    if (documentThemeClaim) {
      // Original inline values were restored above; drop the claim.
      releaseDocumentThemeClaim(documentElement);
    }

    return;
  }

  const original =
    documentThemeClaim?.original ??
    readDocumentThemeInlineValues(documentElement);
  const resolvedTheme = isDarkMode ? "dark" : "light";

  documentElement.setAttribute(STUDIO_DOCUMENT_THEME_ATTRIBUTE, resolvedTheme);
  documentElement.style.colorScheme = resolvedTheme;

  const studioBackground =
    studioRoot != null && typeof window.getComputedStyle === "function"
      ? window.getComputedStyle(studioRoot).getPropertyValue("--background")
      : "";

  if (studioBackground.trim() !== "") {
    documentElement.style.backgroundColor = studioBackground.trim();
  } else {
    documentElement.style.removeProperty("background-color");
  }

  documentThemeClaim = {
    original,
    applied: readDocumentThemeInlineValues(documentElement),
  };
}

/**
 * Release one `useTheme` instance's participation in document-level theming.
 * The document theme is only removed (and the host's original inline values
 * restored) when the last mounted instance releases.
 */
export function releaseDocumentTheme(owner: object): void {
  documentThemeOwners.delete(owner);

  if (documentThemeOwners.size > 0 || typeof document === "undefined") {
    return;
  }

  const documentElement = document.documentElement;
  const claim = documentThemeClaim;

  if (!claim) {
    return;
  }

  if (documentElement.hasAttribute(STUDIO_DOCUMENT_THEME_ATTRIBUTE)) {
    const inlineValues = readDocumentThemeInlineValues(documentElement);

    // Only restore properties Studio still controls; if the host overwrote
    // one after Studio's claim, keep the host's value.
    if (inlineValues.backgroundColor === claim.applied.backgroundColor) {
      setInlinePropertyOrRemove(
        documentElement,
        "background-color",
        claim.original.backgroundColor,
      );
    }

    if (inlineValues.colorScheme === claim.applied.colorScheme) {
      setInlinePropertyOrRemove(
        documentElement,
        "color-scheme",
        claim.original.colorScheme,
      );
    }
  }

  releaseDocumentThemeClaim(documentElement);
}

/**
 * Apply dark mode class to every Studio root element.
 */
export function applyDarkModeClass(isDarkMode: boolean): void {
  const roots = getStudioRoots();

  for (const studioRoot of roots) {
    if (isDarkMode) {
      studioRoot.classList.add("dark");
    } else {
      studioRoot.classList.remove("dark");
    }
  }
}

function syncStudioRootTheme(args: {
  currentThemeVariables: ThemeVariables | null;
  documentThemeOwner: object;
  isDarkMode: boolean;
  removedThemeVariableNames: string[];
}): void {
  const {
    currentThemeVariables,
    documentThemeOwner,
    isDarkMode,
    removedThemeVariableNames,
  } = args;
  const roots = getStudioRoots();

  for (const root of roots) {
    root.classList.toggle("dark", isDarkMode);

    for (const variableName of removedThemeVariableNames) {
      root.style.removeProperty(variableName);
    }

    if (!currentThemeVariables) {
      continue;
    }

    for (const [property, value] of Object.entries(currentThemeVariables)) {
      root.style.setProperty(property, value);
    }
  }

  syncDocumentTheme({
    isDarkMode,
    owner: documentThemeOwner,
    studioRoot: roots[0] ?? null,
  });
}

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Hook to manage custom theme application
 */
export function useTheme(
  customTheme?: CustomTheme | string,
  isDarkMode?: boolean,
) {
  const appliedThemeVariableNamesRef = useRef<string[]>([]);
  const documentThemeOwnerRef = useRef<object>({});
  const parsedTheme = useMemo(() => {
    if (!customTheme) return null;

    if (typeof customTheme === "string") {
      return parseThemeFromCSS(customTheme);
    }

    return customTheme;
  }, [customTheme]);

  const currentThemeVariables = useMemo(() => {
    if (!parsedTheme) return null;

    const mode = isDarkMode ? "dark" : "light";
    return parsedTheme[mode] || {};
  }, [parsedTheme, isDarkMode]);

  useIsomorphicLayoutEffect(() => {
    if (typeof document === "undefined" || !document.body) {
      return;
    }

    const syncStudioRoots = () => {
      const nextThemeVariableNames = Object.keys(currentThemeVariables ?? {});
      const previousThemeVariableNames = appliedThemeVariableNamesRef.current;
      const removedThemeVariableNames = previousThemeVariableNames.filter(
        (name) => !nextThemeVariableNames.includes(name),
      );

      syncStudioRootTheme({
        currentThemeVariables,
        documentThemeOwner: documentThemeOwnerRef.current,
        isDarkMode: isDarkMode ?? false,
        removedThemeVariableNames,
      });

      appliedThemeVariableNamesRef.current = nextThemeVariableNames;
    };

    syncStudioRoots();

    const observer = new MutationObserver(() => {
      syncStudioRoots();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [currentThemeVariables, isDarkMode]);

  // Participate in document-level theming for the lifetime of this instance;
  // the document theme is only released when the last instance unmounts.
  useIsomorphicLayoutEffect(() => {
    const documentThemeOwner = documentThemeOwnerRef.current;

    return () => {
      releaseDocumentTheme(documentThemeOwner);
    };
  }, []);

  return {
    parsedTheme,
    currentThemeVariables,
    hasCustomTheme: !!parsedTheme,
  };
}
