import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../package.json", import.meta.url)),
    "utf8",
  ),
) as { dependencies?: Record<string, string> };

describe("bundled dependencies", () => {
  it("keeps every CodeMirror package out of `dependencies` so they are bundled as one instance", () => {
    // tsup leaves everything in `dependencies` as an external import. The SQL
    // editor bundles @codemirror/state, so an external CodeMirror package would
    // load a second @codemirror/state in the host app and crash the editor with
    // "Unrecognized extension value in extension set".
    const externalCodeMirrorPackages = Object.keys(
      packageJson.dependencies ?? {},
    ).filter((name) =>
      /^(@codemirror\/|@lezer\/|@uiw\/react-codemirror$)/.test(name),
    );

    expect(externalCodeMirrorPackages).toEqual([]);
  });
});
