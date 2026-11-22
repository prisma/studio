import { describe, expect, it } from "vitest";

import {
  BYTES_DISPLAY_LIMIT,
  formatBytesAsHex,
  isBytesDataType,
} from "./format-bytes";

const bytea = { isArray: false, name: "bytea" };
const jsonb = { isArray: false, name: "jsonb" };
const text = { isArray: false, name: "text" };
const sqliteBlob = { affinity: "BLOB", isArray: false, name: "BLOB" };

const hello = [72, 101, 108, 108, 111];

describe("isBytesDataType", () => {
  it.each([
    "bytea",
    "blob",
    "tinyblob",
    "mediumblob",
    "longblob",
    "binary",
    "varbinary",
    "bit",
    "VARBINARY",
  ])("treats %s as bytes", (name) => {
    expect(isBytesDataType({ isArray: false, name })).toBe(true);
  });

  it.each(["text", "jsonb", "json", "varchar binary", "char binary"])(
    "does not treat %s as bytes",
    (name) => {
      expect(isBytesDataType({ isArray: false, name })).toBe(false);
    },
  );

  it("uses SQLite BLOB affinity", () => {
    expect(isBytesDataType(sqliteBlob)).toBe(true);
  });

  it("ignores bytea arrays", () => {
    expect(isBytesDataType({ isArray: true, name: "bytea" })).toBe(false);
  });
});

describe("formatBytesAsHex", () => {
  it("formats the JSON shape of a Node Buffer", () => {
    expect(formatBytesAsHex({ type: "Buffer", data: hello }, bytea)).toBe(
      "\\x48656c6c6f",
    );
  });

  it("formats a Uint8Array and an ArrayBuffer", () => {
    expect(formatBytesAsHex(Uint8Array.from(hello), bytea)).toBe(
      "\\x48656c6c6f",
    );
    expect(formatBytesAsHex(Uint8Array.from(hello).buffer, bytea)).toBe(
      "\\x48656c6c6f",
    );
  });

  it("formats the JSON shape of a Uint8Array on a SQLite BLOB column", () => {
    expect(
      formatBytesAsHex(
        JSON.parse(JSON.stringify(Uint8Array.from(hello))),
        sqliteBlob,
      ),
    ).toBe("\\x48656c6c6f");
  });

  it("shows empty bytes as \\x", () => {
    expect(formatBytesAsHex({ type: "Buffer", data: [] }, bytea)).toBe("\\x");
    expect(formatBytesAsHex(new Uint8Array(), bytea)).toBe("\\x");
  });

  it("returns null for null and undefined", () => {
    expect(formatBytesAsHex(null, bytea)).toBeNull();
    expect(formatBytesAsHex(undefined, bytea)).toBeNull();
  });

  it("truncates long values for display and keeps the full value otherwise", () => {
    const data = Array.from({ length: 100 }, (_, index) => index);
    const value = { type: "Buffer", data };

    const full = formatBytesAsHex(value, bytea);
    expect(full).toHaveLength(2 + 200);

    const shown = formatBytesAsHex(value, bytea, {
      maxBytes: BYTES_DISPLAY_LIMIT,
    });
    expect(shown).toBe(
      `${full!.slice(0, 2 + BYTES_DISPLAY_LIMIT * 2)}… (100 bytes)`,
    );
  });

  it("does not truncate values at the limit", () => {
    const value = new Uint8Array(BYTES_DISPLAY_LIMIT);
    expect(
      formatBytesAsHex(value, bytea, { maxBytes: BYTES_DISPLAY_LIMIT }),
    ).toBe(`\\x${"00".repeat(BYTES_DISPLAY_LIMIT)}`);
  });

  it("leaves a Buffer-shaped object in a JSON or text column alone", () => {
    const lookalike = { type: "Buffer", data: hello };
    expect(formatBytesAsHex(lookalike, jsonb)).toBeNull();
    expect(formatBytesAsHex(lookalike, text)).toBeNull();
  });

  it("does not guess from other values in a bytes column", () => {
    expect(formatBytesAsHex("hello", bytea)).toBeNull();
    expect(formatBytesAsHex(42, sqliteBlob)).toBeNull();
    expect(formatBytesAsHex({ type: "Buffer", data: [300] }, bytea)).toBeNull();
    expect(
      formatBytesAsHex({ type: "Buffer", data: hello, extra: 1 }, bytea),
    ).toBeNull();
    expect(formatBytesAsHex({ a: 1 }, sqliteBlob)).toBeNull();
    expect(formatBytesAsHex([72, 101], bytea)).toBeNull();
  });
});
