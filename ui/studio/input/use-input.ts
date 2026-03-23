import { useStableUiStateKey, useUiState } from "../../hooks/use-ui-state";

export interface UseInputProps {
  initialValue?: string;
  stateKey?: string;
}

export function useInput(props: UseInputProps) {
  const { initialValue, stateKey } = props;
  const fallbackKey = useStableUiStateKey("studio-input");
  const resolvedKey = stateKey ?? fallbackKey;

  const [value, setValue] = useUiState<string>(
    resolvedKey,
    initialValue ?? "",
    { cleanupOnUnmount: true },
  );

  const handleOnChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setValue(event.target.value);
  };

  return { handleOnChange, value, setValue };
}
