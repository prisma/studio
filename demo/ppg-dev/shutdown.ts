const DEMO_SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM", "SIGQUIT"] as const;
const FORCE_EXIT_TIMEOUT_MS = 5_000;

type DemoShutdownSignal = (typeof DEMO_SHUTDOWN_SIGNALS)[number];

type DemoShutdownProcess = {
  on(signal: DemoShutdownSignal, listener: () => void): void;
};

type DemoShutdownLogger = Pick<Console, "error" | "info" | "warn">;

export function getSignalExitCode(signal: DemoShutdownSignal): number {
  switch (signal) {
    case "SIGINT":
      return 130;
    case "SIGTERM":
      return 143;
    case "SIGQUIT":
      return 131;
  }
}

export function createDemoShutdownController(args: {
  cleanupCallbacks: Array<() => Promise<void> | void>;
  exit?: (code: number) => void;
  forceExitTimeoutMs?: number;
  logger?: DemoShutdownLogger;
}) {
  const {
    cleanupCallbacks,
    exit = (code: number) => {
      process.exit(code);
    },
    forceExitTimeoutMs = FORCE_EXIT_TIMEOUT_MS,
    logger = console,
  } = args;
  let isShuttingDown = false;
  let hasExited = false;
  let forceExitTimer: ReturnType<typeof setTimeout> | undefined;

  const requestExit = (args: {
    code: number;
    message?: string;
    method?: "error" | "warn";
  }) => {
    if (hasExited) {
      return;
    }

    hasExited = true;

    if (forceExitTimer !== undefined) {
      clearTimeout(forceExitTimer);
      forceExitTimer = undefined;
    }

    if (args.message && args.method) {
      logger[args.method](args.message);
    }

    exit(args.code);
  };

  const shutdown = async (signal: DemoShutdownSignal) => {
    if (isShuttingDown) {
      requestExit({
        code: getSignalExitCode(signal),
        message: `[demo] received ${signal} again while cleanup was still running; forcing exit`,
        method: "warn",
      });
      return;
    }

    isShuttingDown = true;
    logger.info(`[demo] shutting down (${signal})`);
    forceExitTimer = setTimeout(() => {
      requestExit({
        code: getSignalExitCode(signal),
        message: `[demo] cleanup did not finish within ${forceExitTimeoutMs}ms; forcing exit`,
        method: "error",
      });
    }, forceExitTimeoutMs);

    for (const callback of [...cleanupCallbacks].reverse()) {
      try {
        await callback();
      } catch (error: unknown) {
        logger.error(
          `[demo] cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    requestExit({ code: 0 });
  };

  return {
    isShuttingDown() {
      return isShuttingDown;
    },
    shutdown,
  };
}

export function registerDemoShutdownHandlers(args: {
  cleanupCallbacks: Array<() => Promise<void> | void>;
  exit?: (code: number) => void;
  forceExitTimeoutMs?: number;
  logger?: DemoShutdownLogger;
  processHost?: DemoShutdownProcess;
}) {
  const {
    cleanupCallbacks,
    exit,
    forceExitTimeoutMs,
    logger,
    processHost = process,
  } = args;
  const controller = createDemoShutdownController({
    cleanupCallbacks,
    exit,
    forceExitTimeoutMs,
    logger,
  });

  for (const signal of DEMO_SHUTDOWN_SIGNALS) {
    processHost.on(signal, () => {
      void controller.shutdown(signal);
    });
  }

  return controller;
}
