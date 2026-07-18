import { readFileSync } from "node:fs";

/**
 * The libpq SSL parameters that reference local client-side files or secrets.
 * postgres.js does not understand these and would forward them to the server
 * as runtime configuration parameters, which the server rejects with
 * `unrecognized configuration parameter "sslrootcert"` (prisma/studio#1433).
 */
const SSL_FILE_PARAMETERS = [
  "sslcert",
  "sslkey",
  "sslpassword",
  "sslrootcert",
] as const;

type SslFileParameter = (typeof SSL_FILE_PARAMETERS)[number];

/**
 * The `sslmode` values accepted by libpq.
 */
const SSL_MODES = [
  "disable",
  "allow",
  "prefer",
  "require",
  "verify-ca",
  "verify-full",
] as const;

type SslMode = (typeof SSL_MODES)[number];

function isSslMode(value: string): value is SslMode {
  return (SSL_MODES as readonly string[]).includes(value);
}

export interface PostgresJSSslOptions {
  ca?: string;
  cert?: string;
  checkServerIdentity?: () => undefined;
  key?: string;
  passphrase?: string;
  rejectUnauthorized?: boolean;
}

export interface PostgresJSConnectionConfig {
  /**
   * The connection string with client-side SSL parameters removed so
   * postgres.js does not forward them to the server.
   */
  connectionString: string;
  /**
   * postgres.js client options derived from the consumed SSL parameters.
   * Spread these into the options passed to `postgres()`.
   */
  options: { ssl?: false | PostgresJSSslOptions | "verify-full" };
}

export interface PostgresJSConnectionConfigDependencies {
  readFile?: (path: string) => string;
}

/**
 * Translates a PostgreSQL connection string into postgres.js client options,
 * consuming the standard libpq SSL parameters (`sslrootcert`, `sslcert`,
 * `sslkey`, `sslpassword`, and `sslmode` when needed) client-side instead of
 * letting postgres.js forward them to the server as runtime configuration
 * parameters.
 *
 * Connection strings without client-side SSL file parameters are returned
 * unchanged; postgres.js already consumes `sslmode` on its own.
 */
export function createPostgresJSConnectionConfig(
  connectionString: string,
  dependencies: PostgresJSConnectionConfigDependencies = {},
): PostgresJSConnectionConfig {
  const readFile =
    dependencies.readFile ?? ((path: string) => readFileSync(path, "utf8"));

  const questionMarkIndex = connectionString.indexOf("?");

  if (questionMarkIndex === -1) {
    return { connectionString, options: {} };
  }

  const base = connectionString.slice(0, questionMarkIndex);
  const parameters = new URLSearchParams(
    connectionString.slice(questionMarkIndex + 1),
  );

  const sslFileValues = new Map<SslFileParameter, string>();

  for (const parameter of SSL_FILE_PARAMETERS) {
    // Later occurrences override earlier ones, matching libpq semantics.
    const value = parameters.getAll(parameter).at(-1);

    if (value !== undefined) {
      sslFileValues.set(parameter, value);
    }
  }

  if (sslFileValues.size === 0) {
    return { connectionString, options: {} };
  }

  for (const parameter of SSL_FILE_PARAMETERS) {
    parameters.delete(parameter);
  }

  const rawSslMode = parameters.getAll("sslmode").at(-1) ?? null;
  parameters.delete("sslmode");

  if (rawSslMode !== null && !isSslMode(rawSslMode)) {
    throw new Error(
      `Unsupported "sslmode" connection parameter value "${rawSslMode}". Expected one of: ${SSL_MODES.join(
        ", ",
      )}.`,
    );
  }

  const sslMode: SslMode | null = rawSslMode;

  const useSystemTrustStore = sslFileValues.get("sslrootcert") === "system";

  if (useSystemTrustStore && sslMode !== null && sslMode !== "verify-full") {
    // libpq rejects this combination with "weak sslmode disallowed with
    // system CA" instead of silently weakening or strengthening verification.
    throw new Error(
      `Weak "sslmode" connection parameter value "${sslMode}" is disallowed with "sslrootcert=system". Use sslmode=verify-full.`,
    );
  }

  const remainingQuery = parameters.toString();
  const strippedConnectionString = remainingQuery
    ? `${base}?${remainingQuery}`
    : base;

  if (sslMode === "disable") {
    return {
      connectionString: strippedConnectionString,
      options: { ssl: false },
    };
  }

  if (sslMode === "allow" || sslMode === "prefer") {
    // libpq negotiates plaintext-first (allow) or TLS-with-plaintext-fallback
    // (prefer). postgres.js only supports that negotiation for its built-in
    // "allow"/"prefer" string modes, which cannot carry custom TLS options,
    // so honoring the file parameters would silently force TLS on. Reject the
    // combination instead of changing the negotiation behavior.
    throw new Error(
      `The "sslmode" connection parameter value "${sslMode}" cannot be combined with the client-side SSL file parameters (sslrootcert, sslcert, sslkey, sslpassword). Use sslmode=require, sslmode=verify-ca, or sslmode=verify-full.`,
    );
  }

  const readSslFile = (parameter: SslFileParameter): string => {
    const path = sslFileValues.get(parameter)!;

    try {
      return readFile(path);
    } catch (error: unknown) {
      throw new Error(
        `Failed to read the file referenced by the "${parameter}" connection parameter ("${path}")`,
        { cause: error },
      );
    }
  };

  const ssl: PostgresJSSslOptions = {};

  if (sslFileValues.has("sslrootcert") && !useSystemTrustStore) {
    ssl.ca = readSslFile("sslrootcert");
  }

  if (sslFileValues.has("sslcert")) {
    ssl.cert = readSslFile("sslcert");
  }

  if (sslFileValues.has("sslkey")) {
    ssl.key = readSslFile("sslkey");
  }

  if (sslFileValues.has("sslpassword")) {
    // sslpassword is the passphrase for the client key, not a file path.
    ssl.passphrase = sslFileValues.get("sslpassword");
  }

  if (sslMode === "verify-full" || useSystemTrustStore) {
    // libpq forces verify-full when sslrootcert=system.
    ssl.rejectUnauthorized = true;
  } else if (sslMode === "verify-ca" || ssl.ca !== undefined) {
    // Verify the certificate chain but not the host name. Providing a root
    // certificate upgrades sslmode=require to verify-ca, matching libpq.
    ssl.rejectUnauthorized = true;
    ssl.checkServerIdentity = () => undefined;
  } else {
    // sslmode=require (or no sslmode): encrypt without verification.
    ssl.rejectUnauthorized = false;
  }

  return { connectionString: strippedConnectionString, options: { ssl } };
}
