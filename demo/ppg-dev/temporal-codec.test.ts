import { afterEach, describe, expect, it, vi } from "vitest";

import {
  collectEncodedPayloads,
  decodePayloadsInPlace,
  type RawTemporalPayload,
} from "./temporal-codec";

function payload(encoding: string, data: string): RawTemporalPayload {
  return {
    data: Buffer.from(data),
    metadata: { encoding: Buffer.from(encoding) },
  };
}

const config = { authorization: "Bearer token", endpoint: "http://codec/" };

describe("Temporal codec client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("finds the payloads a codec wrote at any depth and skips plain ones", () => {
    const encrypted = payload("binary/encrypted", "sealed");
    const history = [
      {
        activityTaskScheduledEventAttributes: {
          input: { payloads: [payload("json/plain", "{}"), encrypted] },
        },
      },
    ];

    expect(collectEncodedPayloads(history)).toEqual([encrypted]);
  });

  it("replaces encoded payloads in place with what the Codec Server returns", async () => {
    const encrypted = payload("binary/encrypted", "sealed");
    const root = { memo: { fields: { customer: encrypted } } };
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        Response.json({
          payloads: [
            {
              data: Buffer.from('"Ada"').toString("base64"),
              metadata: {
                encoding: Buffer.from("json/plain").toString("base64"),
              },
            },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await decodePayloadsInPlace(config, "default", root);

    expect(result).toEqual({ decoded: 1, encoded: 0 });
    expect(Buffer.from(encrypted.data!).toString()).toBe('"Ada"');
    expect(fetchMock).toHaveBeenCalledWith(
      "http://codec/decode",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer token",
          "x-namespace": "default",
        }) as unknown,
      }),
    );
  });

  it("leaves payloads encoded and reports the error when the Codec Server fails", async () => {
    const encrypted = payload("binary/encrypted", "sealed");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("no", { status: 401 }))),
    );

    const result = await decodePayloadsInPlace(config, "default", [encrypted]);

    expect(result).toEqual({
      decoded: 0,
      encoded: 1,
      error: "the codec server answered 401 to decode",
    });
    expect(Buffer.from(encrypted.data!).toString()).toBe("sealed");
  });

  it("counts encoded payloads and calls nothing when no Codec Server is set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await decodePayloadsInPlace(undefined, "default", [
      payload("binary/encrypted", "sealed"),
      payload("json/plain", "{}"),
    ]);

    expect(result).toEqual({ decoded: 0, encoded: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
