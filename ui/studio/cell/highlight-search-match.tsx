import { Fragment } from "react";

export interface SearchMatchSegment {
  isMatch: boolean;
  text: string;
}

export interface HighlightSearchMatchProps {
  searchTerm?: string;
  text: string;
}

interface MatchRange {
  end: number;
  start: number;
}

const DATETIME_HIGHLIGHT_TERM_PATTERN =
  /^(\d{4}-\d{2}-\d{2})([Tt ]?)([01]\d|2[0-3])((?::[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?)?)([Zz]?)$/;

export function getSearchMatchSegments(
  text: string,
  searchTerm?: string,
): SearchMatchSegment[] {
  const normalizedSearchTerm = searchTerm?.trim() ?? "";

  if (normalizedSearchTerm.length === 0 || text.length === 0) {
    return [{ isMatch: false, text }];
  }

  const directRanges = getMatchRanges(text, normalizedSearchTerm);

  if (directRanges.length > 0) {
    return rangesToSegments(text, directRanges);
  }

  const dateTimeVariants = getDateTimeTermVariants(normalizedSearchTerm);

  for (const variant of dateTimeVariants) {
    const fallbackRanges = getMatchRanges(text, variant);

    if (fallbackRanges.length > 0) {
      return rangesToSegments(text, fallbackRanges);
    }
  }

  return [{ isMatch: false, text }];
}

function getMatchRanges(text: string, searchTerm: string): MatchRange[] {
  const lowerText = text.toLowerCase();
  const lowerSearchTerm = searchTerm.toLowerCase();
  const ranges: MatchRange[] = [];
  let cursor = 0;
  let matchIndex = lowerText.indexOf(lowerSearchTerm, cursor);

  while (matchIndex !== -1) {
    const end = matchIndex + searchTerm.length;

    ranges.push({
      end,
      start: matchIndex,
    });

    cursor = end;
    matchIndex = lowerText.indexOf(lowerSearchTerm, cursor);
  }

  return ranges;
}

function rangesToSegments(
  text: string,
  ranges: MatchRange[],
): SearchMatchSegment[] {
  if (ranges.length === 0) {
    return [{ isMatch: false, text }];
  }

  const segments: SearchMatchSegment[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({
        isMatch: false,
        text: text.slice(cursor, range.start),
      });
    }

    segments.push({
      isMatch: true,
      text: text.slice(range.start, range.end),
    });
    cursor = range.end;
  }

  if (cursor < text.length) {
    segments.push({
      isMatch: false,
      text: text.slice(cursor),
    });
  }

  return segments;
}

function getDateTimeTermVariants(searchTerm: string): string[] {
  const match = searchTerm.match(DATETIME_HIGHLIGHT_TERM_PATTERN);

  if (!match) {
    return [];
  }

  const [, datePart, separator, hourPart, timeRemainder, zoneSuffix] = match;
  const separatorVariants =
    separator === "" ? ["T", " "] : separator === " " ? ["T", ""] : [" ", ""];
  const zoneVariants = zoneSuffix === "" ? [""] : [zoneSuffix, ""];
  const seen = new Set<string>();
  const variants: string[] = [];

  for (const separatorVariant of separatorVariants) {
    for (const zoneVariant of zoneVariants) {
      const variant = `${datePart}${separatorVariant}${hourPart}${timeRemainder}${zoneVariant}`;

      if (variant.toLowerCase() === searchTerm.toLowerCase()) {
        continue;
      }

      const dedupeKey = variant.toLowerCase();

      if (seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);
      variants.push(variant);
    }
  }

  return variants;
}

export function HighlightSearchMatch(props: HighlightSearchMatchProps) {
  const { searchTerm, text } = props;
  const segments = getSearchMatchSegments(text, searchTerm);

  if (segments.length === 1 && !segments[0]?.isMatch) {
    return <>{text}</>;
  }

  return (
    <>
      {segments.map((segment, index) => {
        const key = `${segment.text}:${index}`;

        if (!segment.isMatch) {
          return <Fragment key={key}>{segment.text}</Fragment>;
        }

        return (
          <mark
            key={key}
            className="rounded-sm bg-yellow-200/80 text-current dark:bg-yellow-300/60"
            data-search-match="true"
          >
            {segment.text}
          </mark>
        );
      })}
    </>
  );
}
