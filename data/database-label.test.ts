import { describe, expect, it } from "vitest";

import { formatDatabaseLabel } from "./database-label";

const SECRETS = ["s3cr3t", "api_key", "sk_live_123", "postgres:", "admin"];

function expectNoSecrets(label: string | null) {
  for (const secret of SECRETS) {
    expect(label ?? "").not.toContain(secret);
  }
}

describe("formatDatabaseLabel", () => {
  it.each([
    [
      "postgresql://admin:s3cr3t@db.example.com:5432/app?sslmode=require&api_key=sk_live_123",
      "db.example.com:5432/app",
    ],
    [
      "postgres://admin:s3cr3t@localhost:51214/template1?sslmode=disable",
      "localhost:51214/template1",
    ],
    [
      "mysql://admin:s3cr3t@mysql.internal:3306/shop",
      "mysql.internal:3306/shop",
    ],
    [
      "prisma+postgres://accelerate.prisma-data.net/?api_key=sk_live_123",
      "accelerate.prisma-data.net",
    ],
    ["postgres://admin:s3cr3t@[::1]:5432/app", "[::1]:5432/app"],
    ["postgresql://admin:s3cr3t@/app?host=/var/run/postgresql", "app"],
    ["file:./prisma/dev.db", "dev.db"],
    ["file:/Users/admin/projects/app/dev.db?connection_limit=1", "dev.db"],
    ["postgres://admin:s3cr3t@db.example.com/my%20db", "db.example.com/my db"],
  ])("reduces %s to %s", (input, expected) => {
    const label = formatDatabaseLabel(input);

    expect(label).toBe(expected);
    expectNoSecrets(label);
  });

  it("keeps plain-text labels from the host as they are", () => {
    expect(formatDatabaseLabel("Acme / production")).toBe("Acme / production");
    expect(formatDatabaseLabel("  adonis-deal-calculator  /  main ")).toBe(
      "adonis-deal-calculator / main",
    );
  });

  it("strips credentials and query strings from text that is not a URL", () => {
    const label = formatDatabaseLabel(
      "admin:s3cr3t@db.example.com:5432/app?api_key=sk_live_123",
    );

    expect(label).toBe("db.example.com:5432/app");
    expectNoSecrets(label);
  });

  it("strips URLs embedded in a longer label", () => {
    const label = formatDatabaseLabel(
      "Staging (postgresql://admin:s3cr3t@staging.example.com/app?api_key=sk_live_123)",
    );

    expect(label).toBe("Staging (staging.example.com/app)");
    expectNoSecrets(label);
  });

  it("strips credentials from URLs it cannot parse", () => {
    const label = formatDatabaseLabel(
      "postgres://admin:s3cr3t@bad host:5432/app?api_key=sk_live_123",
    );

    expect(label).toBe("bad host:5432/app");
    expectNoSecrets(label);
  });

  it.each([
    ["postgres://u:pa/ss@host/db", "host/db"],
    ["postgres://u:pa ss@host/db", "host/db"],
    ["postgres://u:pa ss/x@host:5432/db?api_key=sk_live_123", "host:5432/db"],
  ])(
    "strips malformed credentials with slashes or spaces from %s",
    (input, expected) => {
      const label = formatDatabaseLabel(input);

      expect(label).toBe(expected);
      expect(label).not.toMatch(/pa|ss|u:|sk_live/);
    },
  );

  it.each([
    ["Staging (postgres://u:pa ss@host/db)", "Staging (host/db)"],
    ["Staging (postgres://u:pa/ss@host/db)", "Staging (host/db)"],
    [
      "Prod: postgres://admin:s3 cr3t@db.example.com:5432/app?api_key=sk_live_123 and more",
      "Prod: db.example.com:5432/app and more",
    ],
  ])(
    "strips malformed credentials from URLs embedded in a label: %s",
    (input, expected) => {
      const label = formatDatabaseLabel(input);

      expect(label).toBe(expected);
      expect(label).not.toMatch(/pa ss|pa\/ss|s3 cr3t|admin|u:|sk_live/);
    },
  );

  it.each([
    ["postgres://host/team@corp", "host/team@corp"],
    ["mysql://host:3306/keyspace@primary", "host:3306/keyspace@primary"],
    [
      "mysql://u:s3cr3t@host:3306/keyspace@primary",
      "host:3306/keyspace@primary",
    ],
    [
      "Vitess (mysql://u:pa ss@host:3306/keyspace@replica)",
      "Vitess (host:3306/keyspace@replica)",
    ],
    ["postgres://u:p@ss@host/db", "host/db"],
    ["postgres://admin:1234@db.example.com/app", "db.example.com/app"],
    ["Staging (postgres://u:1234/pa ss@host/db)", "Staging (host/db)"],
    [
      "postgres://u:1234/pa ss@host:5432/db?api_key=sk_live_123",
      "host:5432/db",
    ],
  ])(
    "keeps `@` in the database path but not in credentials: %s",
    (input, expected) => {
      const label = formatDatabaseLabel(input);

      expect(label).toBe(expected);
      expect(label).not.toMatch(/s3cr3t|pa ss|u:|admin|1234/);
    },
  );

  it("is idempotent", () => {
    const inputs = [
      "postgresql://admin:s3cr3t@db.example.com:5432/app?api_key=sk_live_123",
      "Acme / production",
      "file:./dev.db",
    ];

    for (const input of inputs) {
      const once = formatDatabaseLabel(input);

      expect(formatDatabaseLabel(once)).toBe(once);
    }
  });

  it("changes when the database URL changes", () => {
    expect(
      formatDatabaseLabel("postgres://u:p@localhost:5432/app_dev"),
    ).not.toBe(formatDatabaseLabel("postgres://u:p@prod.example.com:5432/app"));
  });

  it.each([undefined, null, "", "   ", "postgres://admin:s3cr3t@"])(
    "returns null when nothing displayable is left (%s)",
    (input) => {
      expect(formatDatabaseLabel(input)).toBeNull();
    },
  );
});
