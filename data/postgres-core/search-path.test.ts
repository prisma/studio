import { describe, expect, it } from "vitest";

import { createPostgresSearchPath } from "./search-path";

describe("postgres-core/search-path", () => {
  it("returns null when no schema is provided", () => {
    expect(createPostgresSearchPath(undefined)).toBeNull();
    expect(createPostgresSearchPath("")).toBeNull();
  });

  it("uses public by itself for the public schema", () => {
    expect(createPostgresSearchPath("public")).toBe('"public"');
  });

  it("places the selected schema before public", () => {
    expect(createPostgresSearchPath("test_app")).toBe('"test_app", public');
  });

  it("quotes schema names for search_path parsing", () => {
    expect(createPostgresSearchPath('tenant "one"')).toBe(
      '"tenant ""one""", public',
    );
  });
});
