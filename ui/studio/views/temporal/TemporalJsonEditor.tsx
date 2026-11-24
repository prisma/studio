import {
  autocompletion,
  closeCompletion,
  type CompletionContext,
  type CompletionResult,
  completionStatus,
  insertCompletionText,
  startCompletion,
} from "@codemirror/autocomplete";
import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import CodeMirror from "@uiw/react-codemirror";
import { type RefObject, useMemo, useRef } from "react";

import { suggestInputCompletions } from "@/data/temporal/input-suggestions";
import { cn } from "@/ui/lib/utils";

/** JSON, token by token: enough to tell keys, values and punctuation apart. */
const jsonLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) {
      return null;
    }

    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) {
      return stream.match(/^\s*:/, false) ? "propertyName" : "string";
    }

    if (stream.match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/)) {
      return "number";
    }

    if (stream.match(/^(?:true|false|null)\b/)) {
      return "atom";
    }

    stream.next();

    return "punctuation";
  },
});

// As in the SQL editor, text stays in ink: weight and tone carry the structure.
const jsonHighlightStyle = HighlightStyle.define([
  { color: "var(--foreground)", fontWeight: "600", tag: tags.propertyName },
  {
    color: "var(--foreground)",
    tag: [tags.string, tags.number, tags.atom],
  },
  { color: "var(--muted-foreground)", tag: tags.punctuation },
]);

const jsonEditorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "var(--foreground)",
    fontSize: "12px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-completionDetail": {
    color: "var(--muted-foreground)",
    fontFamily: "var(--font-family-sans)",
    fontStyle: "normal",
    marginLeft: "12px",
  },
  ".cm-content": {
    caretColor: "var(--foreground)",
    fontFamily: "var(--font-family-monospace)",
    padding: "8px 0",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  ".cm-line": { padding: "0 12px" },
  ".cm-matchingBracket": { backgroundColor: "var(--accent)", outline: "none" },
  ".cm-placeholder": { color: "var(--muted-foreground)" },
  ".cm-scroller": {
    fontFamily: "var(--font-family-monospace)",
    lineHeight: "20px",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    boxShadow: "var(--shadow-middle)",
    color: "var(--popover-foreground)",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-family-monospace)",
    fontSize: "12px",
    maxWidth: "420px",
    minWidth: "220px",
    padding: "4px",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    borderRadius: "4px",
    lineHeight: "20px",
    padding: "2px 8px",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection":
    {
      backgroundColor:
        "color-mix(in srgb, var(--prism-cyan-400) 22%, transparent) !important",
    },
});

export interface TemporalJsonEditorHandle {
  /** Closes the list of suggestions. False when it was not open. */
  closeSuggestions: () => boolean;
}

/**
 * The editor for the arguments of a new Workflow run. It completes keys and
 * values from the inputs of recent runs of the same Workflow Type (`samples`):
 * after `{` or a comma it offers the keys those runs pass, and after a colon
 * the values they have for that key.
 */
export function TemporalJsonEditor(props: {
  ariaLabel: string;
  /** For a dialog that must close the suggestions before it closes itself. */
  handle?: RefObject<TemporalJsonEditorHandle | null>;
  id?: string;
  isInvalid?: boolean;
  minHeight?: string;
  onChange: (value: string) => void;
  /** Runs for Cmd+Enter or Ctrl+Enter. */
  onSubmit?: () => void;
  samples?: unknown[][];
  value: string;
}) {
  const {
    ariaLabel,
    handle,
    id,
    isInvalid,
    minHeight = "148px",
    onChange,
    onSubmit,
    value,
  } = props;
  // The extensions are made once; they read what is current through these.
  const samples = useRef<unknown[][]>([]);
  const submit = useRef(onSubmit);

  samples.current = props.samples ?? [];
  submit.current = onSubmit;

  const extensions = useMemo(() => {
    const complete = (context: CompletionContext): CompletionResult | null => {
      const result = suggestInputCompletions({
        cursor: context.pos,
        samples: samples.current,
        text: context.state.doc.toString(),
      });

      return result
        ? {
            // The suggestions are matched and ordered already.
            filter: false,
            from: result.from,
            options: result.options.map((option) => ({
              apply: (view, _completion, from, to) => {
                view.dispatch(
                  insertCompletionText(view.state, option.insert, from, to),
                );

                // After a key, go on to the values that recent runs have for it.
                if (option.kind === "key") {
                  startCompletion(view);
                }
              },
              detail: option.detail,
              label: option.label,
            })),
            to: result.to,
          }
        : null;
    };

    return [
      jsonLanguage,
      syntaxHighlighting(jsonHighlightStyle),
      jsonEditorTheme,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
      autocompletion({ icons: false, override: [complete] }),
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              submit.current?.();

              return true;
            },
          },
        ]),
      ),
    ];
  }, [ariaLabel]);

  return (
    <CodeMirror
      id={id}
      basicSetup={{
        autocompletion: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        lineNumbers: false,
      }}
      className={cn(
        "overflow-hidden rounded-md border border-input bg-transparent shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        // Half-written JSON is invalid; the field turns red once the user leaves it.
        isInvalid && "[&:not(:focus-within)]:border-destructive",
      )}
      extensions={extensions}
      // Tab moves on to the next control, as in every other field of a form.
      indentWithTab={false}
      maxHeight="320px"
      minHeight={minHeight}
      onChange={onChange}
      onCreateEditor={(view) => {
        if (handle) {
          handle.current = {
            closeSuggestions: () =>
              completionStatus(view.state) !== null && closeCompletion(view),
          };
        }
      }}
      theme="none"
      value={value}
    />
  );
}
