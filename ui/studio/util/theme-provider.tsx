import { createContext, useCallback, useContext, useEffect } from "react";

import { useUiState } from "../../hooks/use-ui-state";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

interface ThemeStateRow {
  theme: Theme;
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useUiState<ThemeStateRow["theme"]>(
    `theme-provider:${storageKey}`,
    (typeof window !== "undefined"
      ? (localStorage.getItem(storageKey) as Theme | null)
      : null) ?? defaultTheme,
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const root = window.document.documentElement;

    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  const setTheme = useCallback(
    (nextTheme: Theme) => {
      if (typeof window === "undefined") {
        return;
      }

      localStorage.setItem(storageKey, nextTheme);
      setThemeState(nextTheme);
    },
    [setThemeState, storageKey],
  );

  const value = {
    theme,
    setTheme,
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
