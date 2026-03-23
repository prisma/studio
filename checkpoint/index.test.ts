import { afterEach, describe, expect, it, vi } from "vitest";

import { check } from "./index";

describe("checkpoint/check", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends expected query parameters and returns JSON", async () => {
    const responseBody = {
      current_version: "1.2.4",
      outdated: false,
    };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(responseBody), { status: 200 }),
      );

    const timestamp = new Date("2024-03-01T10:20:30.000Z");

    const result = await check({
      additionalData: { source: "test" },
      architecture: "arm64",
      baseURL: "https://checkpoint.example.test/v1/",
      cliInstallType: "local",
      cliPathHash: "abc123",
      command: "studio open",
      eventId: "event-1",
      ormDatasourceProvider: "postgresql",
      ormGeneratorProviders: ["prisma-client-js", "drizzle-kit"],
      ormPreviewFeatures: ["driverAdapters"],
      platform: "darwin",
      previousEventId: "event-0",
      product: "prisma-studio-embedded",
      projectHash: "project-123",
      signature: "signature-123",
      skipUpdateCheck: true,
      timestamp,
      version: "1.2.3",
    });

    expect(result).toStrictEqual(responseBody);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [requestUrl, requestInit] = fetchSpy.mock.calls[0]!;
    expect(requestUrl).toBeInstanceOf(URL);

    const url = requestUrl as URL;
    expect(url.toString()).toContain("/v1/check/prisma-studio-embedded?");
    expect(url.searchParams.get("arch")).toBe("arm64");
    expect(url.searchParams.get("check_if_update_available")).toBe("false");
    expect(url.searchParams.get("cli_install_type")).toBe("local");
    expect(url.searchParams.get("cli_path_hash")).toBe("abc123");
    expect(url.searchParams.get("client_event_id")).toBe("event-1");
    expect(url.searchParams.get("command")).toBe("studio open");
    expect(url.searchParams.get("information")).toBe(
      JSON.stringify({ source: "test" }),
    );
    expect(url.searchParams.get("local_timestamp")).toBe(
      "2024-03-01T10:20:30Z",
    );
    expect(url.searchParams.get("os")).toBe("darwin");
    expect(url.searchParams.get("previous_client_event_id")).toBe("event-0");
    expect(url.searchParams.get("project_hash")).toBe("project-123");
    expect(url.searchParams.get("signature")).toBe("signature-123");
    expect(url.searchParams.get("version")).toBe("1.2.3");
    expect(
      url.searchParams.getAll("schema_generators_providers"),
    ).toStrictEqual(["prisma-client-js", "drizzle-kit"]);
    expect(url.searchParams.getAll("schema_preview_features")).toStrictEqual([
      "driverAdapters",
    ]);
    expect(url.searchParams.getAll("schema_providers")).toStrictEqual([
      "postgresql",
    ]);

    expect(requestInit).toStrictEqual({
      headers: {
        Accept: "application/json",
        "User-Agent": "prisma/js-checkpoint",
      },
      method: "GET",
    });
  });

  it("throws on non-ok checkpoint responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("not ok", {
        status: 500,
        statusText: "Internal Server Error",
      }),
    );

    await expect(
      check({
        product: "prisma-studio-embedded",
        signature: "signature-123",
        version: "1.2.3",
      }),
    ).rejects.toThrow("checkpoint response error: 500 Internal Server Error");
  });
});
