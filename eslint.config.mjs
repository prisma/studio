import { FlatCompat } from "@eslint/eslintrc";
import eslint from "@eslint/js";
import * as importPlugin from "eslint-plugin-import";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import eslintConfigPrettier from "eslint-plugin-prettier/recommended";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import simpleImportSortPlugin from "eslint-plugin-simple-import-sort";
import unicornPlugin from "eslint-plugin-unicorn";
import vitestPlugin from "eslint-plugin-vitest";
import globals from "globals";
import tseslint from "typescript-eslint";
import { fileURLToPath } from "url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const compat = new FlatCompat({ baseDirectory: rootDir });

export default tseslint.config(
  {
    files: ["**/*.{ts,tsx,cts,mts,js,jsx,mjs}"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      import: importPlugin,
      "jsx-a11y": jsxA11yPlugin,
      "react-hooks": reactHooksPlugin,
      react: reactPlugin,
      "simple-import-sort": simpleImportSortPlugin,
      unicorn: unicornPlugin,
      vitest: vitestPlugin,
    },
  },

  {
    ignores: ["**/node_modules/**/*", "**/dist/**/*", "**/*.d.ts"],
  },

  {
    files: ["**/*.{ts,tsx,cts,mts,js,jsx,mjs}"],
    languageOptions: {
      parserOptions: {
        allowAutomaticSingleRunInference: true,
        project: "./tsconfig.json",
        tsconfigRootDir: rootDir,
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.es2021,
        ...globals.node,
        ...vitestPlugin.environments.env.globals,
      },
    },
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...compat.config(jsxA11yPlugin.configs.recommended),
      ...compat.config(reactHooksPlugin.configs.recommended),
      ...compat.config(reactPlugin.configs.recommended),
      ...compat.config(reactPlugin.configs["jsx-runtime"]),
    ],
    settings: {
      "import/internal-regex": "^~/",
      "import/resolver": {
        typescript: {
          project: ["./tsconfig.json"],
        },
      },
      react: {
        version: "detect",
      },
      formComponents: ["Form"],
      linkComponents: [
        { name: "Link", linkAttribute: "to" },
        { name: "NavLink", linkAttribute: "to" },
      ],
    },
    rules: {
      "@typescript-eslint/no-base-to-string": "warn",
      "@typescript-eslint/no-redundant-type-constituents": "off",
      "@typescript-eslint/no-misused-promises": "warn",
      "simple-import-sort/imports": "error",
      "react/prop-types": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "no-return-await": "off",
      "@typescript-eslint/return-await": ["error", "always"],
      "no-restricted-imports": [
        "error",
        {
          name: "nuqs",
          message: "Please use exported functions from '/ui/hooks/nuqs.ts'",
        },
      ],
    },
  },

  {
    files: ["**/*.{js,jsx,mjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    files: ["**/*.{spec,test}.{ts,tsx,cts,mts,js,jsx,mjs}"],
    rules: {
      ...vitestPlugin.configs.recommended.rules,
    },
    languageOptions: {
      globals: {
        ...vitestPlugin.environments.env.globals,
      },
    },
  },

  eslintConfigPrettier,
);
