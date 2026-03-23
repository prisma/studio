export interface SqlStatementSegment {
  from: number;
  statement: string;
  to: number;
}

interface ParseState {
  mode:
    | "normal"
    | "single-quote"
    | "double-quote"
    | "line-comment"
    | "block-comment"
    | "dollar-quote";
  blockCommentDepth: number;
  dollarQuoteDelimiter: string;
}

export function splitTopLevelSqlStatements(sql: string): SqlStatementSegment[] {
  const state: ParseState = {
    blockCommentDepth: 0,
    dollarQuoteDelimiter: "",
    mode: "normal",
  };
  const segments: SqlStatementSegment[] = [];
  let segmentStart = 0;
  let index = 0;

  while (index < sql.length) {
    const char = sql[index]!;
    const nextChar = sql[index + 1];

    if (state.mode === "single-quote") {
      if (char === "'" && nextChar === "'") {
        index += 2;
        continue;
      }

      if (char === "'") {
        state.mode = "normal";
      }

      index += 1;
      continue;
    }

    if (state.mode === "double-quote") {
      if (char === '"' && nextChar === '"') {
        index += 2;
        continue;
      }

      if (char === '"') {
        state.mode = "normal";
      }

      index += 1;
      continue;
    }

    if (state.mode === "line-comment") {
      if (char === "\n") {
        state.mode = "normal";
      }

      index += 1;
      continue;
    }

    if (state.mode === "block-comment") {
      if (char === "/" && nextChar === "*") {
        state.blockCommentDepth += 1;
        index += 2;
        continue;
      }

      if (char === "*" && nextChar === "/") {
        state.blockCommentDepth -= 1;
        index += 2;

        if (state.blockCommentDepth <= 0) {
          state.blockCommentDepth = 0;
          state.mode = "normal";
        }

        continue;
      }

      index += 1;
      continue;
    }

    if (state.mode === "dollar-quote") {
      const delimiter = state.dollarQuoteDelimiter;

      if (delimiter && sql.startsWith(delimiter, index)) {
        state.dollarQuoteDelimiter = "";
        state.mode = "normal";
        index += delimiter.length;
        continue;
      }

      index += 1;
      continue;
    }

    if (char === "'") {
      state.mode = "single-quote";
      index += 1;
      continue;
    }

    if (char === '"') {
      state.mode = "double-quote";
      index += 1;
      continue;
    }

    if (char === "-" && nextChar === "-") {
      state.mode = "line-comment";
      index += 2;
      continue;
    }

    if (char === "/" && nextChar === "*") {
      state.mode = "block-comment";
      state.blockCommentDepth = 1;
      index += 2;
      continue;
    }

    if (char === "$") {
      const delimiter = readDollarQuoteDelimiter(sql, index);

      if (delimiter) {
        state.mode = "dollar-quote";
        state.dollarQuoteDelimiter = delimiter;
        index += delimiter.length;
        continue;
      }
    }

    if (char === ";") {
      pushStatementSegment(sql, segmentStart, index, segments);
      segmentStart = index + 1;
    }

    index += 1;
  }

  pushStatementSegment(sql, segmentStart, sql.length, segments);

  return segments;
}

export function getTopLevelSqlStatementAtCursor(args: {
  cursorIndex: number;
  sql: string;
}): SqlStatementSegment | null {
  const { sql } = args;
  const cursorIndex = clamp(args.cursorIndex, 0, sql.length);
  const segments = splitTopLevelSqlStatements(sql);

  if (segments.length === 0) {
    return null;
  }

  for (const segment of segments) {
    if (cursorIndex >= segment.from && cursorIndex <= segment.to) {
      return segment;
    }
  }

  let nearestSegment = segments[0]!;
  let smallestDistance = getDistanceToSegment(cursorIndex, nearestSegment);

  for (const segment of segments.slice(1)) {
    const distance = getDistanceToSegment(cursorIndex, segment);
    if (distance < smallestDistance) {
      smallestDistance = distance;
      nearestSegment = segment;
    }
  }

  return nearestSegment;
}

function pushStatementSegment(
  sql: string,
  start: number,
  end: number,
  segments: SqlStatementSegment[],
): void {
  if (end <= start) {
    return;
  }

  const rawSegment = sql.slice(start, end);
  const trimmedStatement = rawSegment.trim();

  if (trimmedStatement.length === 0) {
    return;
  }

  const leadingWhitespaceLength =
    rawSegment.length - rawSegment.trimStart().length;
  const trailingWhitespaceLength =
    rawSegment.length - rawSegment.trimEnd().length;
  const from = start + leadingWhitespaceLength;
  const to = end - trailingWhitespaceLength;

  segments.push({
    from,
    statement: trimmedStatement,
    to,
  });
}

function getDistanceToSegment(
  cursor: number,
  segment: SqlStatementSegment,
): number {
  if (cursor < segment.from) {
    return segment.from - cursor;
  }

  if (cursor > segment.to) {
    return cursor - segment.to;
  }

  return 0;
}

function readDollarQuoteDelimiter(sql: string, start: number): string | null {
  if (sql[start] !== "$") {
    return null;
  }

  let index = start + 1;

  while (index < sql.length) {
    const char = sql[index]!;

    if (char === "$") {
      const delimiter = sql.slice(start, index + 1);

      if (delimiter === "$$") {
        return delimiter;
      }

      if (/^\$[A-Za-z_][A-Za-z0-9_]*\$$/.test(delimiter)) {
        return delimiter;
      }

      return null;
    }

    if (!/[A-Za-z0-9_]/.test(char)) {
      return null;
    }

    index += 1;
  }

  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
