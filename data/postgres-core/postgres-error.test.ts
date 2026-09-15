import { describe, expect, it } from "vitest";

import { AdapterError } from "../adapter";
import {
  getPostgresErrorCode,
  isPostgresTypeMismatchError,
  POSTGRES_DATATYPE_MISMATCH_CODE,
  POSTGRES_INVALID_TEXT_REPRESENTATION_CODE,
} from "./postgres-error";

function createAdapterErrorWithCode(code: string): AdapterError {
  const error = new AdapterError(`db error: ${code}`) as AdapterError & {
    code?: string;
  };
  error.code = code;
  error.adapterSource = "postgresql";
  return error;
}

describe("getPostgresErrorCode", () => {
  it("returns the string code attached to a driver/adapter error", () => {
    expect(getPostgresErrorCode(createAdapterErrorWithCode("42804"))).toBe(
      "42804",
    );
  });

  it("returns undefined when the error has no code", () => {
    expect(getPostgresErrorCode(new Error("no code"))).toBeUndefined();
  });

  it("returns undefined for non-string code values", () => {
    expect(
      getPostgresErrorCode({ code: 42, message: "numeric code" }),
    ).toBeUndefined();
  });

  it("returns undefined for null/undefined input", () => {
    expect(getPostgresErrorCode(null)).toBeUndefined();
    expect(getPostgresErrorCode(undefined)).toBeUndefined();
  });
});

describe("isPostgresTypeMismatchError", () => {
  it("detects SQLSTATE 42804 (datatype_mismatch)", () => {
    expect(
      isPostgresTypeMismatchError(
        createAdapterErrorWithCode(POSTGRES_DATATYPE_MISMATCH_CODE),
      ),
    ).toBe(true);
  });

  it("detects SQLSTATE 22P02 (invalid_text_representation)", () => {
    expect(
      isPostgresTypeMismatchError(
        createAdapterErrorWithCode(POSTGRES_INVALID_TEXT_REPRESENTATION_CODE),
      ),
    ).toBe(true);
  });

  it("does not match unrelated Postgres SQLSTATEs", () => {
    expect(
      isPostgresTypeMismatchError(createAdapterErrorWithCode("42P01")),
    ).toBe(false);
    expect(
      isPostgresTypeMismatchError(createAdapterErrorWithCode("23505")),
    ).toBe(false);
  });

  it("does not match errors without a SQLSTATE code", () => {
    expect(isPostgresTypeMismatchError(new Error("network failure"))).toBe(
      false,
    );
  });
});
