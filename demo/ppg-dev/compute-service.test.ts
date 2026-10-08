import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Load } from "@prisma/composer";
import { buildConfig } from "@prisma/composer/deploy";
import { assemble } from "@prisma/composer/node/control";
import { describe, expect, it } from "vitest";

import app from "../../module";
import studio from "./compute-service";

describe("Studio Composer app", () => {
  it("targets the connected studio project", () => {
    expect(app.name).toBe("studio");
  });

  it("resolves the app's configured HTTP port through Composer", () => {
    const graph = Load(app);
    const service = graph.nodes.find(({ node }) => node.kind === "service");

    if (!service || service.node.kind !== "service") {
      throw new Error("The Studio app must contain a service.");
    }
    const config = buildConfig(
      service.node,
      service.id,
      graph,
      new Map(),
      new Map(),
    );

    expect(config.service.port).toBe(8080);
  });

  it("declares one service with the complete database and Streams artifact", () => {
    const graph = Load(app);
    const services = graph.nodes.filter(({ node }) => node.kind === "service");

    expect(services).toHaveLength(1);
    expect(services[0]?.id).toBe("studio");
    expect(studio.build).toMatchObject({
      type: "node",
      dir: "../../deploy",
      entry: "bundle/server.bundle.js",
    });
    expect(graph.edges).toHaveLength(0);
  });

  it("assembles the bundled directory without shipping build-machine files", async () => {
    const fixtureRoot = join(process.cwd(), ".prisma-composer");
    await mkdir(fixtureRoot, { recursive: true });
    const cwd = await mkdtemp(join(fixtureRoot, "assembly-test-"));
    const hostDir = await mkdtemp(join(tmpdir(), "studio-build-host-"));
    const outputDir = join(cwd, "deploy");
    const hostFile = join(hostDir, "os-release");
    // Like Prisma Dev's Linux platform check, this is a runtime read of the
    // machine hosting the app. It must not become a deployment dependency.
    const entrySource = `import fs from "node:fs";\nexport const platform = fs.readFileSync(${JSON.stringify(hostFile)}, "utf8");\n`;
    const reports: Readonly<Record<string, string | number>>[] = [];

    try {
      await mkdir(join(outputDir, "bundle"), { recursive: true });
      await mkdir(join(outputDir, "touch"), { recursive: true });
      await writeFile(hostFile, "BUILD_MACHINE_ONLY=1\n");
      await writeFile(join(outputDir, "bundle/server.bundle.js"), entrySource);
      await writeFile(join(outputDir, "bundle/pglite.wasm"), "database asset");
      await writeFile(
        join(outputDir, "touch/processor_worker.js"),
        "export {};\n",
      );

      const build = { ...studio.build, dir: outputDir };
      const artifact = await assemble({
        build,
        address: "studio",
        cwd,
        report: (report) => reports.push(report),
      });
      const bundleDir = join(artifact.dir, "bundle");

      expect(artifact.entry).toBe("bundle/bundle/server.bundle.js");
      expect(await readFile(join(artifact.dir, artifact.entry), "utf8")).toBe(
        entrySource,
      );
      expect((await readdir(bundleDir, { recursive: true })).sort()).toEqual([
        "bundle",
        "bundle/pglite.wasm",
        "bundle/server.bundle.js",
        "touch",
        "touch/processor_worker.js",
      ]);
      expect(reports).toEqual([{ form: "directory", dependencies: "bundled" }]);
    } finally {
      await Promise.all([
        rm(cwd, { recursive: true, force: true }),
        rm(hostDir, { recursive: true, force: true }),
      ]);
    }
  });
});
