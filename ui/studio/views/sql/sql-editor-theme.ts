import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * SQL editor theme built from Studio tokens, so it follows light and dark mode
 * through CSS variables. Syntax colours are the prisma.io/brand Prism hues plus
 * Prisma's classic indigo (see the --code-* tokens in ui/index.css).
 */
const sqlEditorChrome = EditorView.theme({
  "&": {
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    fontSize: "14px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-content": {
    caretColor: "var(--foreground)",
    fontFamily: "var(--font-family-monospace)",
    padding: "12px 0",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-family-monospace)",
    lineHeight: "22px",
  },
  ".cm-line": { padding: "0 16px 0 8px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection":
    {
      backgroundColor:
        "color-mix(in srgb, var(--prism-cyan-400) 22%, transparent) !important",
    },
  ".cm-activeLine": { backgroundColor: "var(--secondary)" },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--foreground)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--background)",
    border: "none",
    color: "var(--code-muted-foreground)",
    paddingLeft: "8px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    fontFamily: "var(--font-family-monospace)",
    fontSize: "12px",
    minWidth: "24px",
  },
  ".cm-placeholder": { color: "var(--code-muted-foreground)" },
  // Lint markers: a quiet token-coloured dot instead of the stock red disc.
  ".cm-lint-marker": {
    backgroundImage: "none",
    borderRadius: "9999px",
    height: "6px",
    margin: "8px 4px",
    width: "6px",
  },
  ".cm-lint-marker-error": { backgroundColor: "var(--destructive)" },
  ".cm-lint-marker-warning": { backgroundColor: "var(--warning)" },
  ".cm-lint-marker-info": { backgroundColor: "var(--info)" },
  ".cm-diagnostic-error": { borderLeftColor: "var(--destructive)" },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    boxShadow: "var(--shadow-middle)",
    color: "var(--popover-foreground)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  ".cm-matchingBracket": {
    backgroundColor: "var(--accent)",
    outline: "none",
  },
});

// Syntax colours come from the Prism brand hues (cyan, yellow, red) plus Prisma's
// classic indigo. Values are per-theme tokens in index.css so both modes stay legible.
const sqlHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.operatorKeyword],
    color: "var(--code-keyword)",
    fontWeight: "600",
  },
  {
    tag: tags.string,
    color: "var(--code-string)",
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.special(tags.name)],
    color: "var(--code-literal)",
  },
  {
    tag: [tags.typeName, tags.standard(tags.name)],
    color: "var(--code-type)",
  },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: "var(--code-muted-foreground)",
    fontStyle: "italic",
  },
  {
    tag: [tags.operator, tags.punctuation, tags.paren, tags.separator],
    color: "var(--code-muted-foreground)",
  },
  {
    // Quoted identifiers ("Order") are names, not strings.
    tag: [tags.name, tags.propertyName, tags.special(tags.string)],
    color: "var(--foreground)",
  },
]);

export const sqlEditorTheme = [
  sqlEditorChrome,
  syntaxHighlighting(sqlHighlightStyle),
];
