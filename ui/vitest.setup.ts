import { beforeEach } from "vitest";

class MemoryStorage implements Storage {
  readonly store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  clear() {
    this.store.clear();
  }

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

const localStorageMock = new MemoryStorage();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorageMock,
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorageMock,
  });
}

beforeEach(() => {
  localStorageMock.clear();
});
