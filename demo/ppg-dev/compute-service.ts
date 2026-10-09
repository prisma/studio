import node from "@prisma/composer/node";
import { compute } from "@prisma/composer-prisma-cloud";

export default compute({
  name: "demo",
  deps: {},
  build: node({
    module: import.meta.url,
    dir: "../../deploy",
    entry: "bundle/server.bundle.js",
    dependencies: "bundled",
  }),
});
