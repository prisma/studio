/** True on macOS and iOS, where shortcuts use ⌘ instead of Ctrl. */
export function isMacPlatform(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)
  );
}
