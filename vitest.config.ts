import { fileURLToPath, URL } from "node:url";

import type { Options } from "tsup";
import { defineConfig } from "vitest/config";

import { default as tsupConfig } from "./tsup.config";

const rootPath = fileURLToPath(new URL("./", import.meta.url));
const resolveAlias = {
  alias: [
    {
      find: /^@\//,
      replacement: `${rootPath}/`,
    },
  ],
};

// https://vitest.dev/guide/projects.html#test-projects
export default defineConfig({
  resolve: resolveAlias,
  test: {
    projects: [
      {
        resolve: resolveAlias,
        test: {
          env: {
            TZ: "UTC",
          },
          environment: "node",
          include: ["checkpoint/**/*.test.ts"],
          name: "checkpoint",
        },
      },
      {
        resolve: resolveAlias,
        esbuild: {
          define: (tsupConfig as Options).define,
        },
        test: {
          env: {
            TZ: "UTC",
          },
          environment: "node",
          fileParallelism: false,
          include: ["data/**/*.test.ts"],
          name: "data",
        },
      },
      {
        resolve: resolveAlias,
        test: {
          env: {
            TZ: "UTC",
          },
          environment: "node",
          include: ["demo/**/*.test.ts"],
          name: "demo",
        },
      },
      {
        resolve: resolveAlias,
        test: {
          env: {
            TZ: "UTC",
          },
          environment: "node",
          include: ["scripts/**/*.test.ts"],
          name: "release",
        },
      },
      {
        resolve: resolveAlias,
        test: {
          environment: "happy-dom", // or "jsdom"
          include: ["ui/**/*.test.{ts,tsx}"],
          name: "ui",
        },
      },
      {
        resolve: resolveAlias,
        test: {
          environment: "node",
          include: ["**/*.e2e.{ts,tsx}"],
          name: "e2e",
          //   browser: {
          //     enabled: true,
          //     headless: true,
          //   },
        },
      },
    ],
  },
});
