import { module } from "@prisma/composer";

import studio from "./demo/ppg-dev/compute-service.ts";

export default module("studio", ({ provision }) => {
  provision(studio);
});
