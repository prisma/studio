import { fileURLToPath } from "node:url";

import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import { createPostgresJSConnectionConfig } from "./connection-options";

type TlsSslOptions = {
  ca?: string;
  cert?: string;
  checkServerIdentity?: () => undefined;
  key?: string;
  passphrase?: string;
  rejectUnauthorized?: boolean;
};

function createReadFileMock(files: Record<string, string>) {
  return vi.fn((path: string) => {
    const contents = files[path];

    if (contents === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }

    return contents;
  });
}

describe("createPostgresJSConnectionConfig", () => {
  it("reproduces the postgres.js behavior of forwarding sslrootcert to the server without translation", () => {
    // Root cause of prisma/studio#1433: postgres.js forwards unknown URL query
    // parameters as server runtime parameters, so the server rejects the
    // connection with `unrecognized configuration parameter "sslrootcert"`.
    const client = postgres(
      "postgres://user:pass@db.example.com:5432/mydb?sslrootcert=/certs/ca.pem",
    );

    expect(
      (client.options as { connection: Record<string, unknown> }).connection
        .sslrootcert,
    ).toBe("/certs/ca.pem");
  });

  it("strips sslrootcert from the connection string and maps it to a client-side CA", () => {
    const readFile = createReadFileMock({ "/certs/ca.pem": "CA-PEM" });

    const config = createPostgresJSConnectionConfig(
      "postgres://user:pass@db.example.com:5432/mydb?sslrootcert=%2Fcerts%2Fca.pem",
      { readFile },
    );

    expect(config.connectionString).toBe(
      "postgres://user:pass@db.example.com:5432/mydb",
    );
    expect(readFile).toHaveBeenCalledWith("/certs/ca.pem");

    const ssl = config.options.ssl as TlsSslOptions;

    expect(ssl.ca).toBe("CA-PEM");
    expect(ssl.rejectUnauthorized).toBe(true);
  });

  it("keeps the translated connection string free of forwarded ssl parameters when passed to postgres.js", () => {
    const readFile = createReadFileMock({ "/certs/ca.pem": "CA-PEM" });

    const config = createPostgresJSConnectionConfig(
      "postgres://user:pass@db.example.com:5432/mydb?sslrootcert=/certs/ca.pem",
      { readFile },
    );

    const client = postgres(config.connectionString, config.options);
    const connection = (
      client.options as { connection: Record<string, unknown> }
    ).connection;

    expect(connection.sslrootcert).toBeUndefined();
    expect(connection.sslcert).toBeUndefined();
    expect(connection.sslkey).toBeUndefined();
    expect(connection.sslpassword).toBeUndefined();
  });

  it("maps sslcert, sslkey, and sslpassword to client certificate options", () => {
    const readFile = createReadFileMock({
      "/certs/ca.pem": "CA-PEM",
      "/certs/client-cert.pem": "CERT-PEM",
      "/certs/client-key.pem": "KEY-PEM",
    });

    const config = createPostgresJSConnectionConfig(
      "postgres://user@db.example.com/mydb?sslrootcert=/certs/ca.pem&sslcert=/certs/client-cert.pem&sslkey=/certs/client-key.pem&sslpassword=secret",
      { readFile },
    );

    expect(config.connectionString).toBe("postgres://user@db.example.com/mydb");

    const ssl = config.options.ssl as TlsSslOptions;

    expect(ssl.ca).toBe("CA-PEM");
    expect(ssl.cert).toBe("CERT-PEM");
    expect(ssl.key).toBe("KEY-PEM");
    expect(ssl.passphrase).toBe("secret");
  });

  it("preserves unrelated query parameters", () => {
    const readFile = createReadFileMock({ "/certs/ca.pem": "CA-PEM" });

    const config = createPostgresJSConnectionConfig(
      "postgres://user@db.example.com/mydb?application_name=studio&sslrootcert=/certs/ca.pem&connect_timeout=10",
      { readFile },
    );

    expect(config.connectionString).toBe(
      "postgres://user@db.example.com/mydb?application_name=studio&connect_timeout=10",
    );
  });

  it("leaves connection strings without client-side ssl file parameters untouched", () => {
    const readFile = createReadFileMock({});

    const plain = createPostgresJSConnectionConfig(
      "postgres://user@db.example.com/mydb",
      { readFile },
    );

    expect(plain.connectionString).toBe("postgres://user@db.example.com/mydb");
    expect(plain.options).toEqual({});

    // postgres.js already consumes sslmode by itself; without file parameters
    // there is nothing to translate.
    const sslmodeOnly = createPostgresJSConnectionConfig(
      "postgres://user@db.example.com/mydb?sslmode=require",
      { readFile },
    );

    expect(sslmodeOnly.connectionString).toBe(
      "postgres://user@db.example.com/mydb?sslmode=require",
    );
    expect(sslmodeOnly.options).toEqual({});
    expect(readFile).not.toHaveBeenCalled();
  });

  it("verifies the certificate chain but not the host name below sslmode=verify-full", () => {
    // libpq compatibility: providing a root certificate upgrades
    // sslmode=require to verify-ca semantics.
    const readFile = createReadFileMock({ "/certs/ca.pem": "CA-PEM" });

    const config = createPostgresJSConnectionConfig(
      "postgres://user@db.example.com/mydb?sslmode=require&sslrootcert=/certs/ca.pem",
      { readFile },
    );

    const ssl = config.options.ssl as TlsSslOptions;

    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.checkServerIdentity?.()).toBeUndefined();
  });

  it("performs full verification for sslmode=verify-full", () => {
    const readFile = createReadFileMock({ "/certs/ca.pem": "CA-PEM" });

    const config = createPostgresJSConnectionConfig(
      "postgres://user@db.example.com/mydb?sslmode=verify-full&sslrootcert=/certs/ca.pem",
      { readFile },
    );

    const ssl = config.options.ssl as TlsSslOptions;

    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.checkServerIdentity).toBeUndefined();
  });

  it("verifies the certificate chain without host name checks for sslmode=verify-ca", () => {
    const readFile = createReadFileMock({ "/certs/ca.pem": "CA-PEM" });

    const config = createPostgresJSConnectionConfig(
      "postgres://user@db.example.com/mydb?sslmode=verify-ca&sslrootcert=/certs/ca.pem",
      { readFile },
    );

    const ssl = config.options.ssl as TlsSslOptions;

    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.checkServerIdentity?.()).toBeUndefined();
  });

  it("does not verify the server certificate for sslmode=require without a root certificate", () => {
    const readFile = createReadFileMock({
      "/certs/client-cert.pem": "CERT-PEM",
      "/certs/client-key.pem": "KEY-PEM",
    });

    const config = createPostgresJSConnectionConfig(
      "postgres://user@db.example.com/mydb?sslmode=require&sslcert=/certs/client-cert.pem&sslkey=/certs/client-key.pem",
      { readFile },
    );

    const ssl = config.options.ssl as TlsSslOptions;

    expect(ssl.cert).toBe("CERT-PEM");
    expect(ssl.key).toBe("KEY-PEM");
    expect(ssl.rejectUnauthorized).toBe(false);
  });

  it("uses the system trust store with full verification for sslrootcert=system", () => {
    const readFile = createReadFileMock({});

    const config = createPostgresJSConnectionConfig(
      "postgres://user@db.example.com/mydb?sslrootcert=system",
      { readFile },
    );

    expect(config.connectionString).toBe("postgres://user@db.example.com/mydb");
    expect(readFile).not.toHaveBeenCalled();

    const ssl = config.options.ssl as TlsSslOptions;

    expect(ssl.ca).toBeUndefined();
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.checkServerIdentity).toBeUndefined();
  });

  it("accepts sslmode=verify-full together with sslrootcert=system", () => {
    const readFile = createReadFileMock({});

    const config = createPostgresJSConnectionConfig(
      "postgres://user@db.example.com/mydb?sslmode=verify-full&sslrootcert=system",
      { readFile },
    );

    expect(config.connectionString).toBe("postgres://user@db.example.com/mydb");

    const ssl = config.options.ssl as TlsSslOptions;

    expect(ssl.ca).toBeUndefined();
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.checkServerIdentity).toBeUndefined();
  });

  it.each(["disable", "allow", "prefer", "require", "verify-ca"] as const)(
    "rejects sslrootcert=system combined with the weaker sslmode=%s",
    (sslMode) => {
      // libpq rejects this combination with "weak sslmode disallowed with
      // system CA" instead of silently changing the verification behavior.
      const readFile = createReadFileMock({});

      expect(() =>
        createPostgresJSConnectionConfig(
          `postgres://user@db.example.com/mydb?sslmode=${sslMode}&sslrootcert=system`,
          { readFile },
        ),
      ).toThrowError(
        new RegExp(
          `Weak "sslmode" connection parameter value "${sslMode}" is disallowed with "sslrootcert=system"`,
        ),
      );
      expect(readFile).not.toHaveBeenCalled();
    },
  );

  it.each(["allow", "prefer"] as const)(
    "rejects sslmode=%s combined with client-side ssl file parameters",
    (sslMode) => {
      // postgres.js cannot negotiate libpq's plaintext fallback while using
      // custom TLS options, so the helper refuses to silently force TLS on.
      const readFile = createReadFileMock({ "/certs/ca.pem": "CA-PEM" });

      expect(() =>
        createPostgresJSConnectionConfig(
          `postgres://user@db.example.com/mydb?sslmode=${sslMode}&sslrootcert=/certs/ca.pem`,
          { readFile },
        ),
      ).toThrowError(
        new RegExp(
          `The "sslmode" connection parameter value "${sslMode}" cannot be combined with the client-side SSL file parameters`,
        ),
      );
      expect(readFile).not.toHaveBeenCalled();
    },
  );

  it("throws a descriptive error for unrecognized sslmode values", () => {
    const readFile = createReadFileMock({ "/certs/ca.pem": "CA-PEM" });

    expect(() =>
      createPostgresJSConnectionConfig(
        "postgres://user@db.example.com/mydb?sslmode=verify-fulll&sslrootcert=/certs/ca.pem",
        { readFile },
      ),
    ).toThrowError(
      /Unsupported "sslmode" connection parameter value "verify-fulll"\. Expected one of: disable, allow, prefer, require, verify-ca, verify-full\./,
    );
    expect(readFile).not.toHaveBeenCalled();
  });

  it("disables ssl entirely for sslmode=disable even when file parameters are present", () => {
    const readFile = createReadFileMock({});

    const config = createPostgresJSConnectionConfig(
      "postgres://user@db.example.com/mydb?sslmode=disable&sslrootcert=/certs/ca.pem",
      { readFile },
    );

    expect(config.connectionString).toBe("postgres://user@db.example.com/mydb");
    expect(config.options.ssl).toBe(false);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("uses the last occurrence when an ssl parameter is repeated", () => {
    const readFile = createReadFileMock({
      "/certs/first.pem": "FIRST-PEM",
      "/certs/second.pem": "SECOND-PEM",
    });

    const config = createPostgresJSConnectionConfig(
      "postgres://user@db.example.com/mydb?sslrootcert=/certs/first.pem&sslrootcert=/certs/second.pem",
      { readFile },
    );

    const ssl = config.options.ssl as TlsSslOptions;

    expect(ssl.ca).toBe("SECOND-PEM");
  });

  it("throws a descriptive error when an ssl file cannot be read", () => {
    const readFile = createReadFileMock({});

    expect(() =>
      createPostgresJSConnectionConfig(
        "postgres://user@db.example.com/mydb?sslrootcert=/certs/missing.pem",
        { readFile },
      ),
    ).toThrowError(
      /Failed to read the file referenced by the "sslrootcert" connection parameter \("\/certs\/missing\.pem"\)/,
    );
  });

  it("reads ssl files from disk by default", () => {
    const config = createPostgresJSConnectionConfig(
      `postgres://user@db.example.com/mydb?sslrootcert=${encodeURIComponent(
        fileURLToPath(import.meta.url),
      )}`,
    );

    const ssl = config.options.ssl as TlsSslOptions;

    expect(ssl.ca).toContain("createPostgresJSConnectionConfig");
  });
});
