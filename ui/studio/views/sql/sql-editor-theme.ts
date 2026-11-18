import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/**
 * SQL editor theme built from Studio tokens, so it follows light and dark mode
 * through CSS variables and only uses prisma.io/brand colours.
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
    color: "var(--muted-foreground)",
    paddingLeft: "8px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    fontFamily: "var(--font-family-monospace)",
    fontSize: "12px",
    minWidth: "24px",
  },
  ".cm-placeholder": { color: "var(--muted-foreground)" },
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

// Brand rule keeps text in ink: structure comes from weight and tone, not hue.
const sqlHighlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.operatorKeyword],
    color: "var(--foreground)",
    fontWeight: "600",
  },
  {
    tag: [
      tags.string,
      tags.special(tags.string),
      tags.number,
      tags.bool,
      tags.null,
    ],
    color: "var(--foreground)",
  },
  {
    tag: [tags.typeName, tags.standard(tags.name)],
    color: "var(--muted-foreground)",
  },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: "var(--muted-foreground)",
    fontStyle: "italic",
  },
  {
    tag: [tags.operator, tags.punctuation, tags.paren, tags.separator],
    color: "var(--muted-foreground)",
  },
  {
    tag: [tags.name, tags.propertyName, tags.special(tags.name)],
    color: "var(--foreground)",
  },
]);

export const sqlEditorTheme = [
  sqlEditorChrome,
  syntaxHighlighting(sqlHighlightStyle),
];
