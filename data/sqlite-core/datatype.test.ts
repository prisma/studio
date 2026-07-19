import { describe, expect, it } from "vitest";

import { determineColumnAffinity, determineColumnMetadata } from "./datatype";

describe("determineColumnAffinity", () => {
  it.each([
    // INTEGER affinity examples
    { datatype: "INT", expected: "INTEGER" },
    { datatype: "INTEGER", expected: "INTEGER" },
    { datatype: "TINYINT", expected: "INTEGER" },
    { datatype: "SMALLINT", expected: "INTEGER" },
    { datatype: "MEDIUMINT", expected: "INTEGER" },
    { datatype: "BIGINT", expected: "INTEGER" },
    { datatype: "UNSIGNED BIG INT", expected: "INTEGER" },
    { datatype: "INT2", expected: "INTEGER" },
    { datatype: "INT8", expected: "INTEGER" },

    // TEXT affinity examples
    { datatype: "CHARACTER(20)", expected: "TEXT" },
    { datatype: "VARCHAR(255)", expected: "TEXT" },
    { datatype: "VARYING CHARACTER(255)", expected: "TEXT" },
    { datatype: "NCHAR(55)", expected: "TEXT" },
    { datatype: "NATIVE CHARACTER(70)", expected: "TEXT" },
    { datatype: "NVARCHAR(100)", expected: "TEXT" },
    { datatype: "TEXT", expected: "TEXT" },
    { datatype: "CLOB", expected: "TEXT" },

    // BLOB affinity examples
    { datatype: "BLOB", expected: "BLOB" },
    { datatype: null, expected: "BLOB" },
    { datatype: "", expected: "BLOB" },

    // REAL affinity examples
    { datatype: "REAL", expected: "REAL" },
    { datatype: "DOUBLE", expected: "REAL" },
    { datatype: "DOUBLE PRECISION", expected: "REAL" },
    { datatype: "FLOAT", expected: "REAL" },

    // NUMERIC affinity examples
    { datatype: "NUMERIC", expected: "NUMERIC" },
    { datatype: "DECIMAL(10,5)", expected: "NUMERIC" },
    { datatype: "BOOLEAN", expected: "NUMERIC" },
    { datatype: "DATE", expected: "NUMERIC" },
    { datatype: "DATETIME", expected: "NUMERIC" },
  ])(
    "should determine affinity for $datatype as $expected",
    ({ datatype, expected }) => {
      const actual = determineColumnAffinity(datatype);

      expect(actual).toBe(expected);
    },
  );
});

describe("determineColumnMetadata", () => {
  it.each([
    // date-like declared types keep NUMERIC affinity, but their values are
    // treated as text so Studio never coerces date strings to numbers.
    { datatype: "DATE", expected: { affinity: "NUMERIC", group: "string" } },
    {
      datatype: "DATETIME",
      expected: { affinity: "NUMERIC", group: "string" },
    },
    {
      datatype: "datetime",
      expected: { affinity: "NUMERIC", group: "string" },
    },
    {
      datatype: "TIMESTAMP",
      expected: { affinity: "NUMERIC", group: "string" },
    },
    { datatype: "TIME", expected: { affinity: "NUMERIC", group: "string" } },
    {
      datatype: "DATETIME(6)",
      expected: { affinity: "NUMERIC", group: "string" },
    },
    {
      datatype: "TIMESTAMP WITH TIME ZONE",
      expected: { affinity: "NUMERIC", group: "string" },
    },

    // NUMERIC-affinity declared types that merely contain a date/time
    // substring are not date-like and stay numeric.
    {
      datatype: "CANDIDATE",
      expected: { affinity: "NUMERIC", group: "numeric" },
    },
    { datatype: "DATED", expected: { affinity: "NUMERIC", group: "numeric" } },
    {
      datatype: "RUNTIME",
      expected: { affinity: "NUMERIC", group: "numeric" },
    },
    {
      datatype: "LIFETIME",
      expected: { affinity: "NUMERIC", group: "numeric" },
    },
    {
      datatype: "TIMES",
      expected: { affinity: "NUMERIC", group: "numeric" },
    },

    // other NUMERIC affinity declared types stay numeric.
    {
      datatype: "NUMERIC",
      expected: { affinity: "NUMERIC", group: "numeric" },
    },
    {
      datatype: "DECIMAL(10,5)",
      expected: { affinity: "NUMERIC", group: "numeric" },
    },
    {
      datatype: "BOOLEAN",
      expected: { affinity: "NUMERIC", group: "numeric" },
    },

    // non-NUMERIC affinities are untouched.
    { datatype: "INT", expected: { affinity: "INTEGER", group: "numeric" } },
    { datatype: "REAL", expected: { affinity: "REAL", group: "numeric" } },
    {
      datatype: "VARCHAR(255)",
      expected: { affinity: "TEXT", group: "string" },
    },
    { datatype: "BLOB", expected: { affinity: "BLOB", group: "raw" } },
    { datatype: null, expected: { affinity: "BLOB", group: "raw" } },
  ])(
    "should determine metadata for $datatype as $expected",
    ({ datatype, expected }) => {
      const actual = determineColumnMetadata(datatype);

      expect(actual).toEqual(expected);
    },
  );
});
