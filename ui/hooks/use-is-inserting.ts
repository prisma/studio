import { useIsMutating } from "@tanstack/react-query";

/**
 * Hook to know whether an insert is currently ongoing.
 */
export function useIsInserting() {
  return useIsMutating({
    predicate({ options: { mutationKey } }) {
      return mutationKey?.[4] === "insert";
    },
  });
}
