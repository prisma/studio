import { afterEach, describe, expect, it, vi } from "vitest";

import { randomUUID } from "./random-uuid";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const nativeGetRandomValues = globalThis.crypto.getRandomValues.bind(
  globalThis.crypto,
);

describe("randomUUID", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the native crypto.randomUUID when available", () => {
    const nativeRandomUUID = vi.fn(
      () => "11111111-2222-4333-8444-555555555555" as const,
    );

    vi.stubGlobal("crypto", {
      getRandomValues: nativeGetRandomValues,
      randomUUID: nativeRandomUUID,
    });

    expect(randomUUID()).toBe("11111111-2222-4333-8444-555555555555");
    expect(nativeRandomUUID).toHaveBeenCalledTimes(1);
  });

  describe("when crypto.randomUUID is unavailable (non-secure context)", () => {
    it("falls back to a UUIDv4 built from crypto.getRandomValues", () => {
      vi.stubGlobal("crypto", {
        getRandomValues: nativeGetRandomValues,
      });

      const generated = new Set(Array.from({ length: 32 }, () => randomUUID()));

      for (const uuid of generated) {
        expect(uuid).toMatch(UUID_V4_PATTERN);
      }

      expect(generated.size).toBe(32);
    });

    it("sets the RFC 4122 version and variant bits", () => {
      const fillWith = (value: number) =>
        vi.stubGlobal("crypto", {
          getRandomValues: (array: Uint8Array) => {
            array.fill(value);
            return array;
          },
        });

      fillWith(0x00);
      expect(randomUUID()).toBe("00000000-0000-4000-8000-000000000000");

      fillWith(0xff);
      expect(randomUUID()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    });
  });
});
