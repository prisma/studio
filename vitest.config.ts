import { fileURLToPath, URL } from "node:url";

import type { Options } from "tsup";
import { configDefaults, defineConfig } from "vitest/config";

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
const maxWorkers =
  process.env.VITEST_MAX_WORKERS ?? (process.env.CI ? "50%" : "2");
const includeHeavyLocalTests =
  process.env.STUDIO_INCLUDE_HEAVY_LOCAL_TESTS === "1";
const localTestExcludes = includeHeavyLocalTests
  ? []
  : [
      "demo/ppg-dev/build-compute.test.ts",
      "ui/studio/views/table/ActiveTableView.filtering.test.tsx",
    ];

// https://vitest.dev/guide/projects.html#test-projects
export default defineConfig({
  resolve: resolveAlias,
  test: {
    exclude: [...configDefaults.exclude, ...localTestExcludes],
    maxWorkers,
    projects: [
      {
        resolve: resolveAlias,
        test: {
          env: {
            TZ: "UTC",
          },
          environment: "node",
          exclude: [...configDefaults.exclude, ...localTestExcludes],
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
          exclude: [...configDefaults.exclude, ...localTestExcludes],
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
          exclude: [...configDefaults.exclude, ...localTestExcludes],
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
          exclude: [...configDefaults.exclude, ...localTestExcludes],
          include: ["scripts/**/*.test.ts"],
          name: "release",
        },
      },
      {
        resolve: resolveAlias,
        test: {
          environment: "happy-dom", // or "jsdom"
          exclude: [...configDefaults.exclude, ...localTestExcludes],
          include: ["ui/**/*.test.{ts,tsx}"],
          name: "ui",
          setupFiles: ["./ui/vitest.setup.ts"],
        },
      },
      {
        resolve: resolveAlias,
        test: {
          environment: "node",
          exclude: [...configDefaults.exclude, ...localTestExcludes],
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
