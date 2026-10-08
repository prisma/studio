import { defineConfig } from "@prisma/composer/config";
import { nodeBuild } from "@prisma/composer/node/control";
import {
  prismaCloud,
  prismaState,
} from "@prisma/composer-prisma-cloud/control";
import { definePrismaConfig } from "prisma/config";

export default definePrismaConfig({
  composer: defineConfig({
    extensions: [prismaCloud({ region: "ap-southeast-1" }), nodeBuild()],
    state: prismaState(),
  }),
});
