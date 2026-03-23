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
    };
  }, [currentThemeVariables, isDarkMode]);

  return {
    parsedTheme,
    currentThemeVariables,
    hasCustomTheme: !!parsedTheme,
  };
}
