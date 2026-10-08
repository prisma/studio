import { Load } from "@prisma/composer";
import { describe, expect, it } from "vitest";

import app from "../../module";
import studio from "./compute-service";

describe("Studio Composer app", () => {
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
});
