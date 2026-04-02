import { existsSync, type FSWatcher, watch } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import postcss, { type AcceptedPlugin } from "postcss";
import type { Sql } from "postgres";

import { serializeError, type StudioBFFRequest } from "../../data/bff";
import {
  STUDIO_LLM_TASKS,
  type StudioLlmErrorCode,
  type StudioLlmRequest,
  type StudioLlmResponse,
} from "../../data/llm";
import pkg from "../../package.json" with { type: "json" };
import { AnthropicOutputLimitError, runAnthropicLlmRequest } from "./anthropic";
import { buildDemoConfig, resolveDemoAiEnabled } from "./config";
import { type DemoRuntime, startDemoRuntime } from "./runtime";
import {
  formatDemoRuntimeUsage,
  parseDemoRuntimeOptions,
} from "./runtime-options";
import { registerDemoShutdownHandlers } from "./shutdown";
import { lintPostgresSql } from "./sql-lint";
import {
  addDemoStartupFailureHint,
  ensurePortAvailable,
} from "./startup-diagnostics";

declare const Bun: {
  build(options: {
    define?: Record<string, string>;
    entrypoints: string[];
    format: "esm";
    minify: boolean;
    sourcemap: "inline";
    splitting: boolean;
    target: "browser";
    write: false;
  }): Promise<{
    logs: Array<{ message: string }>;
    outputs: Array<{
      arrayBuffer(): Promise<ArrayBuffer>;
      path: string;
      text(): Promise<string>;
    }>;
    success: boolean;
  }>;
  serve(options: {
    fetch(request: Request): Promise<Response> | Response;
    idleTimeout?: number;
    port: number;
  }): {
    stop(closeActiveConnections?: boolean): void;
  };
  file(path: string): {
    text(): Promise<string>;
  };
};

type BuiltAsset = {
  bytes: ArrayBuffer;
  contentType: string;
};

type PostgresExecutor = DemoRuntime["postgresExecutor"];

// When the server is bundled by build-compute.ts, the virtual:prebuilt-assets
// module is resolved at bundle time and provides the pre-built client JS, CSS,
// and any additional browser assets.  When running unbundled (normal dev mode)
// the import fails and we fall back to building assets at runtime.

type PrebuiltAssets = {
  appScript: string;
  appStyles: string;
  builtAssets: Map<string, BuiltAsset>;
};

let prebuiltAssets: PrebuiltAssets | null = null;

try {
  prebuiltAssets = await import("virtual:prebuilt-assets");
} catch {
  // Dev mode — assets will be built at runtime.
}

const isProduction = prebuiltAssets !== null;

const APP_PORT = Number.parseInt(process.env.STUDIO_DEMO_PORT ?? "4310", 10);
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const AI_ENABLED = resolveDemoAiEnabled({
  anthropicApiKey: ANTHROPIC_API_KEY,
  envValue:
    process.env.STUDIO_DEMO_AI_ENABLED ??
    process.env.STUDIO_DEMO_AI_FILTERING_ENABLED,
});
const BOOT_ID = crypto.randomUUID();
const STREAMS_PROXY_BASE_PATH = "/api/streams";
const CACHE_CONTROL_STATIC = isProduction
  ? "public, max-age=31536000, immutable"
  : "no-cache, no-store, must-revalidate";

// Dev-only: source tree paths used for runtime asset building and file watching.
const PROJECT_ROOT = isProduction ? "" : resolveProjectRoot();
const CLIENT_ENTRYPOINT = isProduction
  ? ""
  : resolve(PROJECT_ROOT, "demo/ppg-dev/client.tsx");
const STUDIO_CSS_ENTRYPOINT = isProduction
  ? ""
  : resolve(PROJECT_ROOT, "ui/index.css");
const DEMO_ROOT = isProduction ? "" : resolve(PROJECT_ROOT, "demo/ppg-dev");
const POSTCSS_CONFIG_PATH = isProduction
  ? ""
  : resolve(PROJECT_ROOT, "postcss.config.mjs");

const WATCHED_PATHS = isProduction
  ? []
  : ([
      DEMO_ROOT,
      resolve(PROJECT_ROOT, "checkpoint"),
      resolve(PROJECT_ROOT, "data"),
      resolve(PROJECT_ROOT, "ui"),
      resolve(PROJECT_ROOT, "tsconfig.json"),
      POSTCSS_CONFIG_PATH,
    ] as const);

const WATCHED_EXTENSIONS = new Set([
  ".css",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);

const BUILD_DEFINE = {
  VERSION_INJECTED_AT_BUILD_TIME: JSON.stringify(pkg.version),
};

let postgresClient: Sql | null = null;
let postgresExecutor: PostgresExecutor | null = null;
let seededAt: string | null = null;
let streamsServerUrl: string | null = null;
let appScript = "";
let appStyles = "";
let builtAssets = new Map<string, BuiltAsset>();
let assetVersion = 0;
let assetError: string | null = null;

let isBuilding = false;
let isBuildQueued = false;
let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
const reloadClients = new Set<ReadableStreamDefaultController<string>>();
let queryQueue = Promise.resolve();

const cleanupCallbacks: Array<() => Promise<void> | void> = [];

function createAiResponseInit(status = 200): ResponseInit {
  return {
    headers: {
      "content-type": "application/json",
    },
    status,
  };
}

function createAiErrorResponse(args: {
  code: StudioLlmErrorCode;
  message: string;
  status?: number;
}): Response {
  const { code, message, status } = args;
  const payload: StudioLlmResponse = {
    code,
    message,
    ok: false,
  };

  return new Response(JSON.stringify(payload), createAiResponseInit(status));
}

function createAiSuccessResponse(text: string): Response {
  const payload: StudioLlmResponse = {
    ok: true,
    text,
  };

  return new Response(JSON.stringify(payload), createAiResponseInit());
}

function isStudioLlmTask(value: unknown): value is StudioLlmRequest["task"] {
  return (
    typeof value === "string" &&
    STUDIO_LLM_TASKS.includes(value as StudioLlmRequest["task"])
  );
}

function resolveProjectRoot(): string {
  if (process.env.STUDIO_DEMO_ROOT) {
    return resolve(process.env.STUDIO_DEMO_ROOT);
  }

  const cwdRoot = findProjectRoot(process.cwd());

  if (cwdRoot) {
    return cwdRoot;
  }

  const scriptDir = fileURLToPath(new URL(".", import.meta.url));
  const scriptRoot = findProjectRoot(scriptDir);

  if (scriptRoot) {
    return scriptRoot;
  }

  throw new Error(
    "Unable to locate Studio demo root. Set STUDIO_DEMO_ROOT to the repository path.",
  );
}

function findProjectRoot(startDir: string): string | null {
  let current = resolve(startDir);

  while (current.length > 0) {
    if (looksLikeProjectRoot(current)) {
      return current;
    }

    const parent = resolve(current, "..");

    if (parent === current) {
      return null;
    }

    current = parent;
  }

  return null;
}

function looksLikeProjectRoot(candidate: string): boolean {
  return (
    existsSync(resolve(candidate, "package.json")) &&
    existsSync(resolve(candidate, "demo/ppg-dev/client.tsx")) &&
    existsSync(resolve(candidate, "ui/index.css"))
  );
}

async function main(): Promise<void> {
  if (
    process.argv
      .slice(2)
      .some((argument) => argument === "-h" || argument === "--help")
  ) {
    console.info(formatDemoRuntimeUsage());
    return;
  }

  await ensurePortAvailable({
    envVar: "STUDIO_DEMO_PORT",
    port: APP_PORT,
    serviceName: "Studio demo HTTP server",
  });

  const runtime = await startDemoRuntime(
    parseDemoRuntimeOptions(process.argv.slice(2)),
  );

  cleanupCallbacks.push(...runtime.cleanupCallbacks);
  postgresClient = runtime.postgresClient;
  postgresExecutor = runtime.postgresExecutor;
  seededAt = runtime.seededAt;
  streamsServerUrl = runtime.streamsServerUrl;

  if (prebuiltAssets) {
    appScript = prebuiltAssets.appScript;
    appStyles = prebuiltAssets.appStyles;
    builtAssets = prebuiltAssets.builtAssets;
  } else {
    await rebuildAssets("startup");

    const watchers = startWatchers();
    cleanupCallbacks.push(() => {
      for (const watcher of watchers) {
        watcher.close();
      }
    });
  }

  const server = Bun.serve({
    fetch: (request) => handleRequest(request),
    idleTimeout: 120,
    port: APP_PORT,
  });
  cleanupCallbacks.push(() => server.stop(true));

  registerDemoShutdownHandlers({
    cleanupCallbacks,
  });

  console.info(`[demo] Studio demo running at http://localhost:${APP_PORT}`);

  if (runtime.mode === "external") {
    if (runtime.databaseConnectionString) {
      console.info(
        `[demo] external DB URL: ${runtime.databaseConnectionString}`,
      );
    } else {
      console.info("[demo] database disabled; running in streams-only mode");
    }

    if (streamsServerUrl) {
      console.info(`[demo] external streams server URL: ${streamsServerUrl}`);
    }
  } else {
    console.info(
      `[demo] direct tcp DB URL: ${runtime.databaseConnectionString}`,
    );

    if (streamsServerUrl) {
      console.info(`[demo] streams server URL: ${streamsServerUrl}`);
    }
  }

  if (streamsServerUrl) {
    console.info(
      `[demo] streams proxy URL: http://localhost:${APP_PORT}${STREAMS_PROXY_BASE_PATH}`,
    );
  }
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/") {
    return new Response(getHtmlDocument(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (url.pathname === "/api/config") {
    return Response.json(
      buildDemoConfig({
        aiEnabled: AI_ENABLED,
        bootId: BOOT_ID,
        databaseEnabled: postgresExecutor != null,
        seededAt,
        streamsUrl: streamsServerUrl ? STREAMS_PROXY_BASE_PATH : undefined,
      }),
    );
  }

  if (url.pathname === "/api/query") {
    return await handleBffQueryRequest(request);
  }

  if (url.pathname === "/api/ai") {
    return await handleAiRequest(request);
  }

  if (
    url.pathname === STREAMS_PROXY_BASE_PATH ||
    url.pathname.startsWith(`${STREAMS_PROXY_BASE_PATH}/`)
  ) {
    return await handleStreamsProxyRequest(request, url);
  }

  if (!isProduction && url.pathname === "/__reload") {
    return new Response(createReloadStream(), {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      },
    });
  }

  if (url.pathname === "/app.css") {
    return new Response(appStyles, {
      headers: {
        "Cache-Control": CACHE_CONTROL_STATIC,
        "Content-Type": "text/css; charset=utf-8",
      },
    });
  }

  if (url.pathname === "/app.js") {
    if (assetError) {
      return new Response(getAssetErrorScript(assetError), {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Content-Type": "application/javascript; charset=utf-8",
        },
        status: 500,
      });
    }

    return new Response(appScript, {
      headers: {
        "Cache-Control": CACHE_CONTROL_STATIC,
        "Content-Type": "application/javascript; charset=utf-8",
      },
    });
  }

  const asset = builtAssets.get(url.pathname);

  if (asset) {
    return new Response(asset.bytes, {
      headers: {
        "Cache-Control": CACHE_CONTROL_STATIC,
        "Content-Type": asset.contentType,
      },
    });
  }

  return new Response("Not Found", { status: 404 });
}

async function handleBffQueryRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        Allow: "POST,OPTIONS",
      },
      status: 204,
    });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      headers: {
        Allow: "POST,OPTIONS",
      },
      status: 405,
    });
  }

  if (!postgresExecutor) {
    return new Response("Database executor is not ready", { status: 503 });
  }
  const executor = postgresExecutor;

  let payload: StudioBFFRequest;

  try {
    payload = (await request.json()) as StudioBFFRequest;
  } catch {
    return new Response("Invalid JSON payload", { status: 400 });
  }

  try {
    if (payload.procedure === "query") {
      const [error, result] = await runSerializedQuery(() =>
        executor.execute(payload.query),
      );

      return Response.json([error ? serializeError(error) : null, result]);
    }

    if (payload.procedure === "sequence") {
      const [firstQuery, secondQuery] = payload.sequence;

      if (!firstQuery || !secondQuery) {
        return new Response("Invalid sequence payload", { status: 400 });
      }

      const [firstError, firstResult] = await runSerializedQuery(() =>
        executor.execute(firstQuery),
      );

      if (firstError) {
        return Response.json([[serializeError(firstError)]]);
      }

      const [secondError, secondResult] = await runSerializedQuery(() =>
        executor.execute(secondQuery),
      );

      if (secondError) {
        return Response.json([
          [null, firstResult],
          [serializeError(secondError)],
        ]);
      }

      return Response.json([
        [null, firstResult],
        [null, secondResult],
      ]);
    }

    if (payload.procedure === "transaction") {
      if (!Array.isArray(payload.queries) || payload.queries.length === 0) {
        return new Response("Invalid transaction payload", { status: 400 });
      }

      if (typeof executor.executeTransaction !== "function") {
        return new Response("Transaction execution is not supported", {
          status: 501,
        });
      }
      const executeTransaction: NonNullable<
        typeof executor.executeTransaction
      > = (queries, options) => executor.executeTransaction!(queries, options);

      const [error, result] = await runSerializedQuery(() =>
        executeTransaction(payload.queries),
      );

      return Response.json([error ? serializeError(error) : null, result]);
    }

    if (payload.procedure === "sql-lint") {
      const lintPostgresClient = postgresClient;

      if (!lintPostgresClient) {
        return new Response("Database client is not ready", { status: 503 });
      }

      const result = await runSerializedQuery(() =>
        lintPostgresSql({
          postgresClient: lintPostgresClient,
          schemaVersion: payload.schemaVersion,
          sql: payload.sql,
        }),
      );

      return Response.json([null, result]);
    }

    return new Response("Invalid procedure", { status: 400 });
  } catch (error: unknown) {
    return Response.json([serializeError(error)]);
  }
}

async function handleAiRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        Allow: "POST,OPTIONS",
      },
      status: 204,
    });
  }

  if (request.method !== "POST") {
    return createAiErrorResponse({
      code: "request-failed",
      message: "Method Not Allowed",
      status: 405,
    });
  }

  if (!AI_ENABLED) {
    return createAiErrorResponse({
      code: "not-configured",
      message: "Studio AI is not configured.",
      status: 503,
    });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return createAiErrorResponse({
      code: "request-failed",
      message: "Invalid JSON payload",
      status: 400,
    });
  }

  const prompt = (payload as { prompt?: unknown }).prompt;
  const task = (payload as { task?: unknown }).task;

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return createAiErrorResponse({
      code: "request-failed",
      message: "Prompt is required.",
      status: 400,
    });
  }

  if (!isStudioLlmTask(task)) {
    return createAiErrorResponse({
      code: "request-failed",
      message: "Task is required.",
      status: 400,
    });
  }

  try {
    const text = await runAnthropicLlmRequest({
      apiKey: ANTHROPIC_API_KEY,
      request: {
        prompt,
        task,
      },
    });

    return createAiSuccessResponse(text);
  } catch (error) {
    return createAiErrorResponse({
      code:
        error instanceof AnthropicOutputLimitError
          ? "output-limit-exceeded"
          : "request-failed",
      message: error instanceof Error ? error.message : String(error),
      status: 502,
    });
  }
}

async function handleStreamsProxyRequest(
  request: Request,
  url: URL,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        Allow: "GET,HEAD,POST,OPTIONS",
      },
      status: 204,
    });
  }

  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.method !== "POST"
  ) {
    return new Response("Method Not Allowed", {
      headers: {
        Allow: "GET,HEAD,POST,OPTIONS",
      },
      status: 405,
    });
  }

  if (!streamsServerUrl) {
    return new Response("Streams server is not ready", { status: 503 });
  }

  const proxyPathname = url.pathname.slice(STREAMS_PROXY_BASE_PATH.length);
  const normalizedPathname = proxyPathname.length > 0 ? proxyPathname : "/";
  const upstreamUrl = new URL(
    `${normalizedPathname}${url.search}`,
    `${streamsServerUrl.replace(/\/+$/, "")}/`,
  );
  const headers = new Headers(request.headers);
  const body =
    request.method === "POST" ? await request.arrayBuffer() : undefined;

  headers.delete("host");

  const response = await fetch(upstreamUrl, {
    body,
    headers,
    method: request.method,
    redirect: "manual",
    signal: request.signal,
  });
  const responseHeaders = new Headers(response.headers);

  responseHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");

  return new Response(response.body, {
    headers: responseHeaders,
    status: response.status,
    statusText: response.statusText,
  });
}

async function runSerializedQuery<T>(runner: () => Promise<T>): Promise<T> {
  const queued = queryQueue.then(runner, runner);
  queryQueue = queued.then(
    () => undefined,
    () => undefined,
  );
  return await queued;
}

function getHtmlDocument(): string {
  const bustSuffix = isProduction ? "" : `?v=${assetVersion}`;

  const liveReloadScript = isProduction
    ? ""
    : `
    <script>
      (() => {
        let bootId = ${JSON.stringify(BOOT_ID)};

        const connect = () => {
          const stream = new EventSource("/__reload");

          stream.addEventListener("ready", (event) => {
            const payload = JSON.parse(event.data);

            if (payload.bootId !== bootId) {
              window.location.reload();
              return;
            }

            bootId = payload.bootId;
          });

          stream.addEventListener("reload", () => {
            window.location.reload();
          });

          stream.onerror = () => {
            stream.close();
            setTimeout(connect, 750);
          };
        };

        connect();
      })();
    </script>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Studio + ppg demo${isProduction ? "" : " (direct tcp)"}</title>
    <link rel="stylesheet" href="/app.css${bustSuffix}" />
  </head>
  <body style="margin: 0; min-height: 100vh; background: #f3f4f6;">
    <div id="root" style="height: 100vh;"></div>${liveReloadScript}
    <script type="module" src="/app.js${bustSuffix}"></script>
  </body>
</html>`;
}

function createReloadStream(): ReadableStream<string> {
  let currentController: ReadableStreamDefaultController<string> | null = null;

  return new ReadableStream<string>({
    cancel() {
      if (currentController) {
        reloadClients.delete(currentController);
      }
    },
    start(controller) {
      currentController = controller;
      reloadClients.add(controller);
      controller.enqueue(
        `event: ready\ndata: ${JSON.stringify({ bootId: BOOT_ID, version: assetVersion })}\n\n`,
      );
    },
  });
}

function notifyReloadClients(): void {
  const payload = JSON.stringify({ bootId: BOOT_ID, version: assetVersion });

  for (const controller of reloadClients) {
    try {
      controller.enqueue(`event: reload\ndata: ${payload}\n\n`);
    } catch {
      reloadClients.delete(controller);
    }
  }
}

function startWatchers(): FSWatcher[] {
  const watchers: FSWatcher[] = [];

  for (const watchedPath of WATCHED_PATHS) {
    const watcher = watch(watchedPath, { recursive: true }, (_, filename) => {
      if (!filename || !shouldRebuild(filename)) {
        return;
      }

      queueRebuild(`change:${filename}`);
    });

    watchers.push(watcher);
  }

  return watchers;
}

function shouldRebuild(filename: string): boolean {
  if (
    filename.includes(".git") ||
    filename.includes("dist/") ||
    filename.includes("node_modules/")
  ) {
    return false;
  }

  return WATCHED_EXTENSIONS.has(extname(filename));
}

function queueRebuild(reason: string): void {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    void rebuildAssets(reason);
  }, 120);
}

async function rebuildAssets(reason: string): Promise<void> {
  if (isBuilding) {
    isBuildQueued = true;
    return;
  }

  isBuilding = true;

  try {
    const [{ script, assets }, styles] = await Promise.all([
      buildAppBundle(BUILD_DEFINE),
      buildAppStyles(),
    ]);

    appScript = script;
    appStyles = styles;
    builtAssets = assets;
    assetError = null;
    assetVersion += 1;

    console.info(`[demo] rebuilt browser assets (${reason})`);
    notifyReloadClients();
  } catch (error: unknown) {
    assetError = toErrorMessage(error);
    console.error(`[demo] failed rebuilding assets (${reason})`);
    console.error(assetError);
    notifyReloadClients();
  } finally {
    isBuilding = false;

    if (isBuildQueued) {
      isBuildQueued = false;
      queueRebuild("queued-change");
    }
  }
}

async function buildAppBundle(define: Record<string, string>): Promise<{
  assets: Map<string, BuiltAsset>;
  script: string;
}> {
  const result = await Bun.build({
    define,
    entrypoints: [CLIENT_ENTRYPOINT],
    format: "esm",
    minify: false,
    sourcemap: "inline",
    splitting: false,
    target: "browser",
    write: false,
  });

  if (!result.success) {
    throw new Error(
      result.logs.map((log) => log.message).join("\n") ||
        "bun build failed without logs",
    );
  }

  const jsOutput = result.outputs.find((output) => output.path.endsWith(".js"));

  if (!jsOutput) {
    throw new Error("bun build produced no JavaScript output");
  }

  const assets = new Map<string, BuiltAsset>();

  for (const output of result.outputs) {
    if (output.path.endsWith(".js")) {
      continue;
    }

    const path = `/${basename(output.path)}`;

    assets.set(path, {
      bytes: await output.arrayBuffer(),
      contentType: getContentTypeForPath(path),
    });
  }

  return { assets, script: await jsOutput.text() };
}

async function buildAppStyles(): Promise<string> {
  const sourceCss = await Bun.file(STUDIO_CSS_ENTRYPOINT).text();
  const configModule = (await import(
    `${pathToFileURL(POSTCSS_CONFIG_PATH).href}?t=${Date.now()}`
  )) as {
    default: { plugins: AcceptedPlugin[] };
  };

  const result = await postcss(configModule.default.plugins).process(
    sourceCss,
    {
      from: STUDIO_CSS_ENTRYPOINT,
    },
  );

  return result.css;
}

function getContentTypeForPath(path: string): string {
  switch (extname(path)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml; charset=utf-8";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function getAssetErrorScript(error: string): string {
  const message = JSON.stringify(error);

  return `
const message = ${message};
console.error("[demo] Asset build failed", message);
document.body.innerHTML = \`
  <pre style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; margin: 24px; padding: 16px; border-radius: 8px; background: #111827; color: #f9fafb;">
\${message}
  </pre>
\`;
`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return String(error);
}

void main().catch((error: unknown) => {
  console.error(
    `[demo] startup failed: ${addDemoStartupFailureHint({
      appPort: APP_PORT,
      errorMessage: toErrorMessage(error),
    })}`,
  );
  process.exit(1);
});
