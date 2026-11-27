/**
 * Client for a Temporal Codec Server: the HTTP service an application runs so
 * that tools can read payloads its Workers compress or encrypt. The protocol is
 * `POST <endpoint>/decode` and `POST <endpoint>/encode` with
 * `{ payloads: [{ metadata: { key: base64 }, data: base64 }] }`.
 * https://docs.temporal.io/production-deployment/data-encryption
 */
export interface TemporalCodecConfig {
  /** Sent as the `Authorization` header of every codec request. */
  authorization?: string;
  /** False sends arguments typed in Studio to the server as plain JSON. */
  encodeOutgoing?: boolean;
  endpoint: string;
}

export interface RawTemporalPayload {
  data?: Uint8Array | null;
  metadata?: Record<string, Uint8Array> | null;
}

interface WirePayload {
  data?: string;
  metadata?: Record<string, string>;
}

/** Encodings every SDK's default converter writes. Anything else needs the codec. */
const STANDARD_ENCODINGS = new Set([
  "binary/null",
  "binary/plain",
  "binary/protobuf",
  "json/plain",
  "json/protobuf",
]);

function isRawPayload(value: unknown): value is RawTemporalPayload {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const metadata = (value as RawTemporalPayload).metadata;

  return (
    metadata != null &&
    typeof metadata === "object" &&
    metadata.encoding instanceof Uint8Array
  );
}

export function payloadEncoding(payload: RawTemporalPayload): string {
  return Buffer.from(payload.metadata?.encoding ?? []).toString("utf8");
}

/**
 * Finds every payload under `root` that a codec wrote, at any depth. History
 * events, pending Activities, Query results and Schedule actions all carry
 * payloads in different places, so the search does not depend on field names.
 */
export function collectEncodedPayloads(root: unknown): RawTemporalPayload[] {
  const found: RawTemporalPayload[] = [];
  const visit = (value: unknown) => {
    if (value == null || typeof value !== "object") {
      return;
    }

    if (value instanceof Uint8Array) {
      return;
    }

    if (isRawPayload(value)) {
      if (!STANDARD_ENCODINGS.has(payloadEncoding(value))) {
        found.push(value);
      }

      return;
    }

    for (const entry of Array.isArray(value) ? value : Object.values(value)) {
      visit(entry);
    }
  };

  visit(root);

  return found;
}

function toWire(payload: RawTemporalPayload): WirePayload {
  return {
    data: Buffer.from(payload.data ?? []).toString("base64"),
    metadata: Object.fromEntries(
      Object.entries(payload.metadata ?? {}).map(([key, value]) => [
        key,
        Buffer.from(value).toString("base64"),
      ]),
    ),
  };
}

function fromWire(payload: WirePayload): RawTemporalPayload {
  return {
    data: Buffer.from(payload.data ?? "", "base64"),
    metadata: Object.fromEntries(
      Object.entries(payload.metadata ?? {}).map(([key, value]) => [
        key,
        Buffer.from(value, "base64"),
      ]),
    ),
  };
}

export async function callCodec(
  config: TemporalCodecConfig,
  direction: "decode" | "encode",
  namespace: string,
  payloads: RawTemporalPayload[],
): Promise<RawTemporalPayload[]> {
  const response = await fetch(
    `${config.endpoint.replace(/\/+$/, "")}/${direction}`,
    {
      body: JSON.stringify({ payloads: payloads.map(toWire) }),
      headers: {
        "content-type": "application/json",
        "x-namespace": namespace,
        ...(config.authorization
          ? { authorization: config.authorization }
          : {}),
      },
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(
      `the codec server answered ${response.status} to ${direction}`,
    );
  }

  const body = (await response.json()) as { payloads?: WirePayload[] };

  if (
    !Array.isArray(body.payloads) ||
    body.payloads.length !== payloads.length
  ) {
    throw new Error(
      `the codec server returned ${body.payloads?.length ?? 0} payloads for ${payloads.length}`,
    );
  }

  return body.payloads.map(fromWire);
}

export interface CodecDecodeResult {
  decoded: number;
  /** Payloads still encoded: no codec is set, or the codec failed. */
  encoded: number;
  error?: string;
}

/**
 * Replaces every codec-written payload under `root` with its decoded form, in
 * place. A codec failure leaves the payloads as they are and reports the error.
 */
export async function decodePayloadsInPlace(
  config: TemporalCodecConfig | undefined,
  namespace: string,
  root: unknown,
): Promise<CodecDecodeResult> {
  const encoded = collectEncodedPayloads(root);

  if (encoded.length === 0 || !config) {
    return { decoded: 0, encoded: encoded.length };
  }

  try {
    const decoded = await callCodec(config, "decode", namespace, encoded);

    encoded.forEach((payload, index) => {
      payload.data = decoded[index]!.data;
      payload.metadata = decoded[index]!.metadata;
    });

    return {
      decoded: encoded.length,
      encoded: collectEncodedPayloads(root).length,
    };
  } catch (error) {
    return {
      decoded: 0,
      encoded: encoded.length,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
