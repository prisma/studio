import { describe, expect, it } from "vitest";

import { determineColumnAffinity } from "./datatype";

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
