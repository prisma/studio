const {
  patchStudioDevPackages,
} = require("./scripts/dev/local-streams-override.cjs");

module.exports = {
  hooks: {
    readPackage(pkg) {
      return patchStudioDevPackages(pkg, {
        env: process.env,
        logger: console,
        rootDir: __dirname,
      });
    },
  },
};
