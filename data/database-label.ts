/**
 * Turns whatever an embedder knows about its connection into a label that is
 * safe to show: in the UI, in the DOM and in the browser tab title.
 *
 * Embedders should call this on the server, before the label leaves it, and
 * Studio applies it again to the `databaseLabel` prop. Running it twice gives
 * the same result.
 *
 * - A connection URL becomes `host:port/database` (or the file name for SQLite
 *   and other host-less URLs). User names, passwords, query parameters such
 *   as `api_key`, and fragments are dropped.
 * - A URL is only shown when it reads unambiguously: `new URL` parses it and
 *   no `@` follows its credentials. Otherwise a malformed password could be
 *   mistaken for a host or path, so the URL and everything after it are
 *   dropped instead of guessed at. Studio then falls back to the name the
 *   database reports.
 * - Plain text is kept, except for words that hold credentials
 *   (`user:password@…`) and query strings (`?key=value`).
 *
 * When the connection's fields are available, prefer building the label from
 * them (e.g. `${host}:${port}/${database}`).
 *
 * @returns the safe label, or `null` when nothing displayable is left.
 */
export function formatDatabaseLabel(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const label = formatText(value).replace(/\s+/g, " ").trim();

  return label.length > 0 ? label : null;
}

/** The start of a `scheme://…` or `file:…` URL. */
const URL_START_PATTERN = /\b(?:[a-z][a-z0-9+.-]*:\/\/|file:)/i;

/** Closing punctuation that belongs to the surrounding text, not the URL. */
const TRAILING_PUNCTUATION_PATTERN = /[)\]}>,.;:'"]+$/;

/** Opening punctuation left dangling when the URL after it is dropped. */
const DANGLING_OPENER_PATTERN = /[\s([{<:,;'"-]+$/;

function formatText(text: string): string {
  const start = URL_START_PATTERN.exec(text);

  if (!start) {
    return formatPlainText(text);
  }

  const before = formatPlainText(text.slice(0, start.index));
  const rest = text.slice(start.index);
  const [token = ""] = /^\S*/.exec(rest) ?? [];
  const trailing = TRAILING_PUNCTUATION_PATTERN.exec(token)?.[0] ?? "";
  const url = token.slice(0, token.length - trailing.length);
  const after = rest.slice(token.length);
  const formatted = formatUrl(url);

  // A malformed password can hold spaces, so an `@` later in the text may
  // still belong to this URL's credentials. Neither case can be read safely.
  if (formatted === null || after.includes("@")) {
    return before.replace(DANGLING_OPENER_PATTERN, "");
  }

  return `${before}${formatted}${trailing}${formatText(after)}`;
}

function formatUrl(token: string): string | null {
  let url: URL;

  try {
    url = new URL(token);
  } catch {
    return null;
  }

  const path = safeDecode(url.pathname).replace(/\/+$/, "");

  // The parser ends the credentials at the last `@` before the path. An `@`
  // after that means part of a malformed password was read as host or path.
  if (`${path}${url.search}${url.hash}`.includes("@")) {
    return null;
  }

  if (url.host) {
    return `${url.host}${path}`;
  }

  // Host-less URLs (`file:./dev.db`) name a file: keep the last segment.
  return path.split("/").pop() ?? "";
}

function formatPlainText(text: string): string {
  return text
    .split(/(\s+)/)
    .map((word) =>
      // `user:password@…`: the password may hold `@` too, so drop the word.
      /:[^@]*@/.test(word) ? "" : word.replace(/\?\S*=\S*/, ""),
    )
    .join("");
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
