import node from "@prisma/composer/node";
import { compute } from "@prisma/composer-prisma-cloud";

export default compute({
  name: "studio",
  deps: {},
  build: node({
    module: import.meta.url,
    dir: "../../deploy",
    entry: "bundle/server.bundle.js",
  }),
});
