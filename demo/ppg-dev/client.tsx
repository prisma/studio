import { createRoot } from "react-dom/client";

import type { Adapter } from "../../data/adapter";
import { createStudioBFFClient } from "../../data/bff";
import { createPostgresAdapter } from "../../data/postgres-core";
import type { DemoConfig } from "./config";
import { DemoApp } from "./DemoShell";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error('Element "#root" not found');
}

const root = createRoot(rootElement);

void bootstrap().catch((error: unknown) => {
  root.render(
    <FailureState
      message={error instanceof Error ? error.message : String(error)}
    />,
  );
});

async function bootstrap(): Promise<void> {
  root.render(<LoadingState />);

  const configResponse = await fetch("/api/config");

  if (!configResponse.ok) {
    throw new Error(
      `Failed loading demo config (${configResponse.status} ${configResponse.statusText})`,
    );
  }

  const config = (await configResponse.json()) as DemoConfig;

  const adapter: Adapter = createPostgresAdapter({
    executor: createStudioBFFClient({
      url: "/api/query",
    }),
  });

  root.render(
    <DemoApp
      adapter={adapter}
      bootId={config.bootId}
      seededAt={config.seededAt}
      aiEnabled={config.ai?.enabled === true}
      streamsUrl={config.streams?.url}
    />,
  );
}
function LoadingState() {
  return (
    <div
      style={{
        alignItems: "center",
        color: "#0f172a",
        display: "flex",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        height: "100vh",
        justifyContent: "center",
      }}
    >
      Starting Prisma Postgres and seeding demo data...
    </div>
  );
}

function FailureState(props: { message: string }) {
  return (
    <pre
      style={{
        background: "#111827",
        borderRadius: "10px",
        color: "#f9fafb",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        margin: "24px",
        padding: "16px",
        whiteSpace: "pre-wrap",
      }}
    >
      {props.message}
    </pre>
  );
}
