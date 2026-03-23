import { HighlightSearchMatch } from "./highlight-search-match";

export interface StringCellProps {
  searchTerm?: string;
  value: string;
}

export function StringCell(props: StringCellProps) {
  const { searchTerm, value } = props;

  const startTrimmed = value.trimStart();
  const trimmed = value.trim();
  const trailingWhitespaceLength = !startTrimmed
    ? 0
    : value.length - value.trimEnd().length;

  return (
    <>
      <span className="text-muted-foreground select-none">
        {"·".repeat(value.length - startTrimmed.length)}
      </span>
      <HighlightSearchMatch searchTerm={searchTerm} text={trimmed} />
      <span className="text-muted-foreground select-none">
        {"·".repeat(trailingWhitespaceLength)}
      </span>
    </>
  );
}
