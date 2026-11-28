/**
 * Turns whatever an embedder knows about its connection into a label that is
 * safe to show: in the UI, in the DOM and in the browser tab title.
 *
 * Embedders should call this on the server, before the label leaves it, and
 * Studio applies it again to the `databaseLabel` prop. Running it twice gives
 * the same result.
 *
 * - Connection URLs become `host:port/database` (or the file name for SQLite
 *   and other host-less URLs). User names, passwords, query parameters such
 *   as `api_key`, and fragments are dropped.
 * - Plain text is kept, except for anything that looks like inline
 *   credentials (`user:password@`) or a query string (`?key=value`).
 *
 * @returns the safe label, or `null` when nothing displayable is left.
 */
export function formatDatabaseLabel(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const label = value
    .replace(USERINFO_PATTERN, stripMalformedUserinfo)
    .replace(URL_PATTERN, formatUrlToken)
    .replace(INLINE_CREDENTIALS_PATTERN, "")
    .replace(QUERY_STRING_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();

  return label.length > 0 ? label : null;
}

/**
 * `scheme://` followed by everything up to the first `@` (before a `?`, `#`,
 * bracket or quote): the user info of every connection URL in the text, when
 * it has one. Malformed passwords can hold `/` or spaces, which would split
 * the URL into tokens before `new URL` sees it, so they are removed first.
 */
const USERINFO_PATTERN = /\b([a-z][a-z0-9+.-]*:\/\/)([^?#()[\]{}<>"'@]*)@/gi;

/** `host:port` or `host:port/path`, i.e. no user info before the `@`. */
const HOST_AND_PORT_PATTERN = /^(\[[^\]]*\]|[^:/\s]+):\d*(\/|$)/;

function stripMalformedUserinfo(
  match: string,
  scheme: string,
  beforeAt: string,
): string {
  // `user:password@…` is user info. Text without a colon, or a `host:port`
  // whose path holds the `@` (e.g. a Vitess `keyspace@primary` database),
  // is not, so it is left for `new URL` to parse.
  const isUserinfo =
    beforeAt.includes(":") && !HOST_AND_PORT_PATTERN.test(beforeAt);

  return isUserinfo ? scheme : match;
}

/** `scheme://…` and `file:…` tokens anywhere in the text. */
const URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/\S*|\bfile:\S+/gi;

/** `user:password@` left over in text that is not a parseable URL. */
const INLINE_CREDENTIALS_PATTERN = /[^\s/@]*:[^\s/@]*@/g;

/** `?key=value…` left over in text that is not a parseable URL. */
const QUERY_STRING_PATTERN = /\?\S*=\S*/g;

function formatUrlToken(match: string): string {
  // Closing punctuation belongs to the surrounding text, not the URL.
  const [, token = match, trailing = ""] =
    /^(.*?)([)\]}>,.;:'"]*)$/.exec(match) ?? [];

  return `${formatUrl(token)}${trailing}`;
}

function formatUrl(token: string): string {
  let url: URL;

  try {
    url = new URL(token);
  } catch {
    // Not parseable: drop the scheme, credentials and query string by hand.
    return token
      .replace(/^[a-z][a-z0-9+.-]*:(\/\/)?/i, "")
      .replace(INLINE_CREDENTIALS_PATTERN, "")
      .replace(/^[^?#]*@/, "")
      .replace(/[?#].*$/, "")
      .replace(/^\/+/, "");
  }

  const path = safeDecode(url.pathname).replace(/\/+$/, "");

  if (url.host) {
    return `${url.host}${path}`;
  }

  // Host-less URLs (`file:./dev.db`, `postgresql:///app?host=/var/run`) name
  // a file or a database: keep only the last path segment.
  return path.split("/").pop() ?? "";
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
