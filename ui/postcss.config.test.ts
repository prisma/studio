// @vitest-environment node

import postcss from "postcss";
import { describe, expect, it } from "vitest";

import { createStudioPostcssPlugins } from "../postcss.config.mjs";

describe("Studio PostCSS theme scoping", () => {
  it("keeps dark theme variables scoped to the Studio root", async () => {
    const result = await postcss(createStudioPostcssPlugins()).process(
      `
        :root {
          --background: white;
        }

        .dark {
          --background: black;
        }

        .surface {
          color: var(--background);
        }
      `,
      { from: undefined },
    );

    expect(result.css).toContain(".ps {");
    expect(result.css).toContain("--background: white;");
    expect(result.css).toContain(".ps.dark {");
    expect(result.css).toContain("--background: black;");
    expect(result.css).toContain(".ps .surface {");
    expect(result.css).not.toContain("\n.dark {");
  });

  it("keeps runtime background utilities bound to the theme variable", async () => {
    const result = await postcss(createStudioPostcssPlugins()).process(
      `
        :root {
          --background: white;
        }

        .dark {
          --background: black;
        }

        .surface {
          background-color: var(--background);
        }
      `,
      { from: undefined },
    );

    expect(result.css).toContain(".ps .surface {");
    expect(result.css).toContain("background-color: var(--background);");
    expect(result.css).not.toContain("background-color: black;");
  });
});
