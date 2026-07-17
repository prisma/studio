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

/**
 * Studio may only paint the page canvas when no host styling claimed it.
 * Embedded hosts (Console, arbitrary web apps) style `<html>`/`<body>`
 * themselves, so Studio must leave their document untouched. Full-page
 * shells that ship an unstyled document (the default-white overscroll and
 * behind-border-radius areas from prisma/studio#1475) are safe to claim.
 */
function canOwnDocumentBackground(): boolean {
  const documentElement = document.documentElement;

  if (documentElement.hasAttribute(STUDIO_DOCUMENT_THEME_ATTRIBUTE)) {
    // Already claimed by Studio earlier; keep syncing.
    return true;
  }

  if (hasAuthoredBackground(documentElement)) {
    return false;
  }

  const body = document.body;

  return body == null || !hasAuthoredBackground(body);
}

/**
 * Sync the resolved Studio theme to the document root so overscroll areas and
 * the space behind Studio's rounded corners match the active theme. This is
 * a no-op whenever the host page authored its own document background.
 */
export function syncDocumentTheme(args: {
  isDarkMode: boolean;
  studioRoot: HTMLElement | null;
}): void {
  if (typeof document === "undefined") {
    return;
  }

  if (!canOwnDocumentBackground()) {
    return;
  }

  const { isDarkMode, studioRoot } = args;
  const documentElement = document.documentElement;
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
}

/**
 * Remove the document-level theme Studio applied, if any.
 */
export function clearDocumentTheme(): void {
  if (typeof document === "undefined") {
    return;
  }

  const documentElement = document.documentElement;

  if (!documentElement.hasAttribute(STUDIO_DOCUMENT_THEME_ATTRIBUTE)) {
    return;
  }

  documentElement.removeAttribute(STUDIO_DOCUMENT_THEME_ATTRIBUTE);
  documentElement.style.removeProperty("color-scheme");
  documentElement.style.removeProperty("background-color");
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
  isDarkMode: boolean;
  removedThemeVariableNames: string[];
}): void {
  const { currentThemeVariables, isDarkMode, removedThemeVariableNames } = args;
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

  syncDocumentTheme({ isDarkMode, studioRoot: roots[0] ?? null });
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
      clearDocumentTheme();
    };
  }, [currentThemeVariables, isDarkMode]);

  return {
    parsedTheme,
    currentThemeVariables,
    hasCustomTheme: !!parsedTheme,
  };
}
