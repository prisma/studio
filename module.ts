import { module } from "@prisma/composer";

import studio from "./demo/ppg-dev/compute-service.ts";

export default module("studio-preview", ({ provision }) => {
  // Compute's runtime already listens on 3000; bind the app separately.
  provision(studio, { params: { port: 8080 } });
});
