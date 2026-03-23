import { useEffect } from "react";

import { useUiState } from "./use-ui-state";

const MOBILE_BREAKPOINT = 768;
const MOBILE_STATE_KEY = "viewport-mobile";

export function useIsMobile() {
  const [isMobile, setIsMobile] = useUiState<boolean>(
    MOBILE_STATE_KEY,
    typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT,
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, [setIsMobile]);

  return Boolean(isMobile);
}
