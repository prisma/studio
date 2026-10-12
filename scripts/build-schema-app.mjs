import { mkdir, readFile, writeFile } from "node:fs/promises";

import { build } from "esbuild";
import postcss from "postcss";

import { createStudioPostcssPlugins } from "../postcss.config.mjs";

const result = await build({
  entryPoints: ["ui/schema-diff/app-entry.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
});
const sourceCss = await readFile("ui/index.css", "utf8");
const css = await postcss(createStudioPostcssPlugins()).process(sourceCss, {
  from: "ui/index.css",
});
const script = result.outputFiles[0].text.replaceAll("</script", "<\\/script");
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0} ${css.css}</style></head><body><div id="root"></div><script>${script}</script></body></html>`;
await mkdir("dist/ui/schema-diff", { recursive: true });
await writeFile(
  "dist/ui/schema-diff/app.js",
  `export const schemaDiffAppHtml = ${JSON.stringify(html)};`,
);
await writeFile(
  "dist/ui/schema-diff/app.cjs",
  `exports.schemaDiffAppHtml = ${JSON.stringify(html)};`,
);
for (const extension of ["d.ts", "d.cts"])
  await writeFile(
    `dist/ui/schema-diff/app.${extension}`,
    "export declare const schemaDiffAppHtml: string;\n",
  );
