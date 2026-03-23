import { Maximize } from "lucide-react";
import { useEffect, useState } from "react";

import type { Adapter } from "../../data/adapter";
import type { StudioLlm, StudioLlmResponse } from "../../data/llm";
import { isStudioLlmResponse } from "../../data/llm";
import { Studio } from "../../ui";

function canUseBrowserFullscreen(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof document.documentElement.requestFullscreen === "function"
  );
}

function isBrowserFullscreen(): boolean {
  return typeof document !== "undefined" && document.fullscreenElement != null;
}

function DemoFullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(() => isBrowserFullscreen());
  const canEnterFullscreen = canUseBrowserFullscreen();

  useEffect(() => {
    if (!canEnterFullscreen) {
      return;
    }

    const handleFullscreenChange = () => {
      setIsFullscreen(isBrowserFullscreen());
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [canEnterFullscreen]);

  if (!canEnterFullscreen || isFullscreen) {
    return null;
  }

  return (
    <button
      aria-label="Enter demo fullscreen"
      onClick={() => {
        void document.documentElement.requestFullscreen().catch((error) => {
          console.error("Failed to enter browser fullscreen", error);
        });
      }}
      style={{
        alignItems: "center",
        background: "rgba(255, 255, 255, 0.86)",
        border: "1px solid rgba(15, 23, 42, 0.12)",
        borderRadius: "10px",
        color: "#0f172a",
        cursor: "pointer",
        display: "inline-flex",
        height: "36px",
        justifyContent: "center",
        width: "36px",
      }}
      type="button"
    >
      <Maximize size={16} />
    </button>
  );
}

export function DemoApp(props: {
  adapter: Adapter;
  aiEnabled: boolean;
  bootId: string;
  seededAt: string;
}) {
  const { adapter, aiEnabled, bootId, seededAt } = props;
  const llm: StudioLlm | undefined = aiEnabled
    ? async (request) => {
        const response = await fetch("/api/ai", {
          body: JSON.stringify(request),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        });

        let payload: unknown;

        try {
          payload = (await response.json()) as unknown;
        } catch {
          return {
            code: "request-failed",
            message: `AI request failed (${response.status} ${response.statusText})`,
            ok: false,
          } satisfies StudioLlmResponse;
        }

        if (isStudioLlmResponse(payload)) {
          return payload;
        }

        return {
          code: "request-failed",
          message: response.ok
            ? "AI response did not match the Studio LLM contract."
            : `AI request failed (${response.status} ${response.statusText})`,
          ok: false,
        } satisfies StudioLlmResponse;
      }
    : undefined;

  return (
    <div
      style={{
        background:
          "linear-gradient(165deg, #f8fafc 0%, #e2e8f0 40%, #dbeafe 100%)",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        height: "100vh",
        width: "100%",
      }}
    >
      <header
        style={{
          alignItems: "center",
          backdropFilter: "blur(6px)",
          background: "rgba(255, 255, 255, 0.86)",
          borderBottom: "1px solid rgba(15, 23, 42, 0.1)",
          color: "#0f172a",
          display: "flex",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          fontSize: "13px",
          fontWeight: 500,
          gap: "10px",
          justifyContent: "space-between",
          padding: "10px 14px",
        }}
      >
        <div style={{ display: "flex", gap: "12px", letterSpacing: "0.02em" }}>
          <strong>Studio + ppg demo</strong>
          <span>seeded {new Date(seededAt).toLocaleString()}</span>
        </div>
        <div style={{ alignItems: "center", display: "flex", gap: "10px" }}>
          <code style={{ opacity: 0.72 }}>boot: {bootId.slice(0, 8)}</code>
          <DemoFullscreenButton />
        </div>
      </header>

      <main style={{ minHeight: 0, padding: "12px" }}>
        <Studio
          adapter={adapter}
          llm={llm}
        />
      </main>
    </div>
  );
}
