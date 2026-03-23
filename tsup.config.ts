import { defineConfig, type Options } from "tsup";

import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  banner: ({ format }) =>
    // See https://stackoverflow.com/a/77753164
    format === "esm"
      ? {
          js: `import * as ___react___ from 'react';
import * as ___react_dom___ from 'react-dom'; 

function require(mod) {
  if (mod === 'react') return ___react___;
  if (mod === 'react-dom') return ___react_dom___;
  throw new Error(\`Unknown module \${mod}\`);
}`,
        }
      : undefined,
  bundle: true,
  cjsInterop: true,
  clean: true,
  env: {
    NODE_ENV: process.env.CI ?? "development",
  },
  define: {
    VERSION_INJECTED_AT_BUILD_TIME: `"${pkg.version}"`,
  },
  dts: true,
  entry: [
    "./data/bff/index.ts",
    "./data/index.ts",
    "./data/mysql-core/index.ts",
    "./data/mysql2/index.ts",
    "./data/node-sqlite/index.ts",
    "./data/pglite/index.ts",
    "./data/postgres-core/index.ts",
    "./data/postgresjs/index.ts",
    "./data/sqlite-core/index.ts",
    "./data/sqljs/index.ts",
    "./ui/index.css",
    "./ui/index.tsx",
  ],
  external: ["@types/react", "react", "react-dom"],
  format: ["cjs", "esm"],
  metafile: true,
  minify: true,
  outDir: "dist",
  platform: "browser",
  sourcemap: "inline",
  loader: {
    ".css": "copy",
    ".svg": "dataurl",
  },
} satisfies Options);
