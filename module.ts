import { module } from "@prisma/composer";

import studio from "./demo/ppg-dev/compute-service.ts";

export default module("studio", ({ provision }) => {
  // Composer uses this port for both the app and Compute's HTTP mapping.
  provision(studio, { params: { port: 8080 } });
});
