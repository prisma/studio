import tailwindcssPlugin from "@tailwindcss/postcss";
import unnestCssPlugin from "postcss-nested";
import prefixSelectorPlugin from "postcss-prefix-selector";
import valueParser from "postcss-value-parser";

/**
 * @typedef {import('postcss').Plugin} PostCSSPlugin
 */

/**
 * Custom PostCSS plugin to strip @layer rules in final CSS
 * @returns {PostCSSPlugin}
 */
function stripLayersPlugin() {
  return {
    postcssPlugin: "strip-layers",
    AtRule(atRule) {
      if (atRule.name === "layer") {
        if (atRule.nodes) {
          atRule.replaceWith(...atRule.nodes); // move inner rules up
        } else {
          atRule.remove();
        }
      }
    },
  };
}

/**
 * Custom PostCSS plugin to collect CSS variables.
 * This plugin gathers CSS custom properties (variables) into a map for later use.
 * Variables starting with "--tw" are ignored as they are part of tailwind internals.
 * @param {Record<string, string>} variableMap
 * @returns {PostCSSPlugin}
 */
function isRuntimeThemeVariableDeclaration(decl) {
  if (decl.parent?.type !== "rule") {
    return false;
  }

  const selectors = decl.parent.selector
    .split(",")
    .map((selector) => selector.trim());

  return selectors.some(
    (selector) =>
      selector === ":root" ||
      selector === ".dark" ||
      selector === ".ps" ||
      selector === ".ps.dark",
  );
}

function collectCssVariablesPlugin(variableMap) {
  return {
    postcssPlugin: "collect-css-variables",
    Declaration(decl) {
      if (isRuntimeThemeVariableDeclaration(decl)) {
        return;
      }

      if (decl.prop && decl.prop.startsWith("--")) {
        // we don't touch tailwind's internals, they are wrapped in .ps anyways
        if (decl.prop.startsWith("--tw") === false) {
          variableMap[decl.prop] = decl.value;
        }
      }
    },
  };
}

/**
 * Custom PostCSS plugin to resolve inline CSS variables.
 * This plugin replaces CSS variable references (e.g., var(--variable))
 * with their corresponding values from the variableMap.
 * @param {Record<string, string>} variableMap
 * @returns {PostCSSPlugin}
 */
function inlineCssVariablesPlugin(variableMap) {
  return {
    postcssPlugin: "inline-css-variables-resolve",
    Declaration(decl) {
      const parsedValue = valueParser(decl.value);
      parsedValue.walk((node) => {
        // for var() nodes, iterate and inject variable values inline
        if (node.type === "function" && node.value === "var") {
          const nodes = [];
          for (const child of node.nodes) {
            if (child.type === "word" && child.value.startsWith("--")) {
              child.value = variableMap[child.value] || child.value;
            }
            nodes.push(child);
          }

          // if the first node is in our map, discard var() altogether
          const firstArgument = nodes.at(0);
          if (firstArgument?.value.startsWith("--") === false) {
            node.type = "word";
            node.value = valueParser.stringify([firstArgument]);
            delete node.nodes;
          }
        }
      });
      decl.value = parsedValue.toString();
    },
  };
}

export function createStudioPostcssPlugins() {
  const variableMap = {};

  // order is important
  return [
    tailwindcssPlugin,
    // prevents css nesting, which is not supported on old browsers and in vs code webwiew
    unnestCssPlugin,
    // css variables are inlined from scoped Studio theme selectors
    collectCssVariablesPlugin(variableMap),
    inlineCssVariablesPlugin(variableMap),
    // everything is re-wrapped in .ps to prevent global pollution
    prefixSelectorPlugin({
      transform(_prefix, selector, _prefixedSelector, _filePath) {
        if (selector === ":root") {
          return ".ps"; // prevent global pollution
        }

        if (selector === ".dark") {
          return ".ps.dark"; // keep dark theme variables scoped to Studio
        }

        if (selector.startsWith(".ps")) {
          return selector; // prevent re-wrapping
        }

        return `.ps ${selector}`; // prevent pollution
      },
    }),
    // tailwind v4 enforces the use of @layer, no way to opt out, only with our custom plugin
    // @layer pushes our css class priority to the lowest, resulting in broken css in Console
    stripLayersPlugin(),
  ];
}

/** @type {import('postcss').ProcessOptions} */
export default {
  plugins: createStudioPostcssPlugins(),
};
