import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDemoShutdownController,
  registerDemoShutdownHandlers,
} from "./shutdown";

function createDeferredPromise() {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve() {
      resolvePromise();
    },
  };
}

function createLogger() {
  return {
    error: vi.fn<(message?: unknown) => void>(),
    info: vi.fn<(message?: unknown) => void>(),
    warn: vi.fn<(message?: unknown) => void>(),
  };
}

function createProcessHost() {
  const listeners = new Map<string, () => void>();

  return {
    emit(signal: "SIGINT" | "SIGQUIT" | "SIGTERM") {
      listeners.get(signal)?.();
    },
    listenerCount() {
      return listeners.size;
    },
    on(signal: "SIGINT" | "SIGQUIT" | "SIGTERM", listener: () => void) {
      listeners.set(signal, listener);
    },
  };
}

describe("createDemoShutdownController", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("runs cleanup callbacks in reverse order and exits cleanly", async () => {
    const cleanupOrder: string[] = [];
    const exit = vi.fn<(code: number) => void>();
    const logger = createLogger();
    const controller = createDemoShutdownController({
      cleanupCallbacks: [
        () => {
          cleanupOrder.push("first");
        },
        () => {
          cleanupOrder.push("second");
        },
      ],
      exit,
      logger,
    });

    await controller.shutdown("SIGINT");

    expect(cleanupOrder).toEqual(["second", "first"]);
    expect(logger.info).toHaveBeenCalledWith("[demo] shutting down (SIGINT)");
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("forces exit when the same signal arrives again during cleanup", async () => {
    const deferredCleanup = createDeferredPromise();
    const exit = vi.fn<(code: number) => void>();
    const logger = createLogger();
    const controller = createDemoShutdownController({
      cleanupCallbacks: [() => deferredCleanup.promise],
      exit,
      logger,
    });

    void controller.shutdown("SIGINT");
    await Promise.resolve();
    await controller.shutdown("SIGINT");

    expect(controller.isShuttingDown()).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      "[demo] received SIGINT again while cleanup was still running; forcing exit",
    );
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(130);

    deferredCleanup.resolve();
    await Promise.resolve();

    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("forces exit after a timeout if cleanup hangs", async () => {
    vi.useFakeTimers();

    const deferredCleanup = createDeferredPromise();
    const exit = vi.fn<(code: number) => void>();
    const logger = createLogger();
    const controller = createDemoShutdownController({
      cleanupCallbacks: [() => deferredCleanup.promise],
      exit,
      forceExitTimeoutMs: 250,
      logger,
    });

    void controller.shutdown("SIGINT");
    await vi.advanceTimersByTimeAsync(250);

    expect(logger.error).toHaveBeenCalledWith(
      "[demo] cleanup did not finish within 250ms; forcing exit",
    );
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(130);
  });
});

describe("registerDemoShutdownHandlers", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("registers shutdown listeners and routes signals into the controller", async () => {
    const processHost = createProcessHost();
    const exit = vi.fn<(code: number) => void>();
    const logger = createLogger();

    registerDemoShutdownHandlers({
      cleanupCallbacks: [],
      exit,
      logger,
      processHost,
    });

    expect(processHost.listenerCount()).toBe(3);

    processHost.emit("SIGTERM");
    await Promise.resolve();

    expect(logger.info).toHaveBeenCalledWith("[demo] shutting down (SIGTERM)");
    expect(exit).toHaveBeenCalledWith(0);
  });
});
