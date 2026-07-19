/**
 * Generates a random UUIDv4 string.
 *
 * Prefers the native `crypto.randomUUID`, which is only available in secure
 * contexts (https or localhost). When Studio is served over plain HTTP on a
 * non-localhost host (e.g. `http://192.168.x.x:5555`), `crypto.randomUUID` is
 * undefined, so this falls back to building a UUIDv4 from
 * `crypto.getRandomValues`, which is available in non-secure contexts too.
 */
export function randomUUID(): string {
  if (typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));

  // Per RFC 4122 section 4.4: set the version to 4 and the variant to 10xx.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
