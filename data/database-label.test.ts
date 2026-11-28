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

  it("drops plain-text words that hold credentials, and query strings", () => {
    expect(
      formatDatabaseLabel(
        "Staging admin:s3cr3t@db.example.com:5432/app?api_key=sk_live_123",
      ),
    ).toBe("Staging");
    expect(formatDatabaseLabel("db.example.com/app?api_key=sk_live_123")).toBe(
      "db.example.com/app",
    );
    // A user name alone is not a secret.
    expect(formatDatabaseLabel("admin@prod")).toBe("admin@prod");
  });

  it("formats clean URLs embedded in a longer label", () => {
    const label = formatDatabaseLabel(
      "Staging (postgresql://admin:s3cr3t@staging.example.com/app?api_key=sk_live_123)",
    );

    expect(label).toBe("Staging (staging.example.com/app)");
    expectNoSecrets(label);
  });

  it.each([
    // Malformed: the parser rejects it, or an `@` follows the credentials.
    ["postgres://u:pa/ss@host/db", null],
    ["postgres://u:pa ss@host/db", null],
    ["postgres://u:1234/pa@host/db", null],
    ["postgres://u:p@ss/pa[ss@host/db", null],
    ["postgres://u:1?ss@host/db", null],
    ["postgres://u:1#ss@host/db", null],
    ["Staging (postgres://u:pa ss@host/db)", "Staging"],
    ["Staging (postgres://u:p@ss/pa[ss@host/db)", "Staging"],
    [
      "Prod: postgres://admin:s3 cr3t@db.example.com:5432/app?api_key=sk_live_123 and more",
      "Prod",
    ],
    // Ambiguous with the above, so dropped too; Studio then shows the name
    // the database reports.
    ["mysql://u:s3cr3t@host:3306/keyspace@primary", null],
    ["postgres://host/team@corp", null],
  ])(
    "drops a URL it can't read unambiguously, and anything after it: %s",
    (input, expected) => {
      expect(formatDatabaseLabel(input)).toBe(expected);
    },
  );

  it("keeps a password with `@` that the URL parser separates cleanly", () => {
    expect(formatDatabaseLabel("postgres://u:p@ss@host/db")).toBe("host/db");
    expect(
      formatDatabaseLabel("postgres://admin:1234@db.example.com/app"),
    ).toBe("db.example.com/app");
  });

  describe("never shows any part of a password", () => {
    const user = "Usr1";
    // Each fragment is unique, so finding one in a label means a leak.
    const fragments = ["Zq9", "Xw7", "Kp2", "Lm4", "Nb6", "Hj5", "Vc3", "Rt8"];
    const separators = ["@", "/", "?", "#", "[", "]", ":", " ", "'", '"', ")"];
    const passwords = [
      ...separators.map((separator) => fragments.slice(0, 3).join(separator)),
      `1234/${fragments[0]}@${fragments[1]}`,
      `1234?${fragments[0]}@${fragments[1]}`,
      `1234#${fragments[0]}`,
      `1234 ${fragments[0]}`,
      fragments.join("@/ ?#[]:"),
    ];
    const templates = [
      (url: string) => url,
      (url: string) => `Staging (${url})`,
      (url: string) => `Prod: ${url} and more`,
      (url: string) => `${url} owner admin@example.com`,
    ];
    const cases = passwords.flatMap((password) =>
      templates.map((template) =>
        template(`postgres://${user}:${password}@db.example.com:5432/app`),
      ),
    );

    it.each(cases)("%s", (input) => {
      const label = formatDatabaseLabel(input) ?? "";

      for (const secret of [user, ...fragments, "1234"]) {
        expect(label).not.toContain(secret);
      }
    });
  });

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
