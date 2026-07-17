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
        background:
          "light-dark(rgba(255, 255, 255, 0.86), rgba(30, 41, 59, 0.86))",
        border:
          "1px solid light-dark(rgba(15, 23, 42, 0.12), rgba(148, 163, 184, 0.24))",
        borderRadius: "10px",
        color: "light-dark(#0f172a, #e2e8f0)",
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
  hasDatabase: boolean;
  seededAt?: string;
  streamsUrl?: string;
}) {
  const { adapter, aiEnabled, bootId, hasDatabase, seededAt, streamsUrl } =
    props;
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
          "linear-gradient(165deg, light-dark(#f8fafc, #0b1220) 0%, light-dark(#e2e8f0, #131c2e) 40%, light-dark(#dbeafe, #1a2440) 100%)",
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
          background:
            "light-dark(rgba(255, 255, 255, 0.86), rgba(15, 23, 42, 0.86))",
          borderBottom:
            "1px solid light-dark(rgba(15, 23, 42, 0.1), rgba(148, 163, 184, 0.2))",
          color: "light-dark(#0f172a, #e2e8f0)",
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
          {seededAt ? (
            <span>seeded {new Date(seededAt).toLocaleString()}</span>
          ) : null}
        </div>
        <div style={{ alignItems: "center", display: "flex", gap: "10px" }}>
          <code style={{ opacity: 0.72 }}>boot: {bootId.slice(0, 8)}</code>
          <DemoFullscreenButton />
        </div>
      </header>

      <main
        style={{
          display: "flex",
          minHeight: 0,
          minWidth: 0,
          overflow: "hidden",
          padding: "12px",
        }}
      >
        <Studio
          adapter={adapter}
          hasDatabase={hasDatabase}
          llm={llm}
          streamsUrl={streamsUrl}
        />
      </main>
    </div>
  );
}
