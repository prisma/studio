/**
 * Suggestions for the input of a new Workflow run, from the inputs of recent
 * runs of the same Workflow Type. An input is the list of arguments, so a
 * sample is a JSON array.
 */

const MAX_OPTIONS = 12;
const MAX_LABEL_LENGTH = 64;

export interface InputContext {
  /** The end of the text a suggestion replaces. */
  from: number;
  /** True when a colon already follows the key under the cursor. */
  hasColon: boolean;
  kind: "key" | "none" | "value";
  /**
   * Where the cursor is: the keys from the list of arguments down. An argument
   * is its position in the list; an item of any other array is `*`.
   */
  path: string[];
  /** The keys the object under the cursor has already. */
  presentKeys: string[];
  to: number;
  /** What the user typed of the key or value, without its opening quote. */
  typed: string;
}

interface Frame {
  index: number;
  isArray: boolean;
  key: string | null;
  keys: string[];
  state: "colon" | "comma" | "key" | "value";
}

function pathOf(frames: Frame[], withLast: boolean): string[] {
  return frames.flatMap((frame, depth) => {
    if (!withLast && depth === frames.length - 1) {
      return [];
    }

    return frame.isArray
      ? [depth === 0 ? String(frame.index) : "*"]
      : [frame.key ?? ""];
  });
}

/**
 * Reads JSON text up to the cursor and says whether the cursor is where a key
 * or a value goes, and where in the input that is. The text need not be valid:
 * the user is in the middle of writing it.
 */
export function inputContextAt(text: string, cursor: number): InputContext {
  const frames: Frame[] = [];
  let open: { isString: boolean; start: number } | null = null;
  let index = 0;

  while (index < cursor) {
    const char = text[index]!;
    const top = frames.at(-1);

    if (/\s/.test(char)) {
      index++;
    } else if (char === '"') {
      let end = index + 1;

      while (end < cursor && text[end] !== '"') {
        end += text[end] === "\\" ? 2 : 1;
      }

      if (end >= cursor) {
        open = { isString: true, start: index };
        break;
      }

      if (top && !top.isArray && top.state === "key") {
        top.key = text.slice(index + 1, end);
        top.keys.push(top.key);
        top.state = "colon";
      } else if (top) {
        top.state = "comma";
      }

      index = end + 1;
    } else if (char === "{" || char === "[") {
      frames.push({
        index: 0,
        isArray: char === "[",
        key: null,
        keys: [],
        state: char === "[" ? "value" : "key",
      });
      index++;
    } else if (char === "}" || char === "]") {
      frames.pop();

      const parent = frames.at(-1);

      if (parent) {
        parent.state = "comma";
      }

      index++;
    } else if (char === ":") {
      if (top) {
        top.state = "value";
      }

      index++;
    } else if (char === ",") {
      if (top?.isArray) {
        top.index++;
        top.state = "value";
      } else if (top) {
        top.key = null;
        top.state = "key";
      }

      index++;
    } else {
      // A number, true, false or null, or the start of one.
      let end = index;

      while (end < cursor && !/[\s,:{}[\]"]/.test(text[end]!)) {
        end++;
      }

      if (end >= cursor) {
        open = { isString: false, start: index };
        break;
      }

      if (top) {
        top.state = "comma";
      }

      index = end;
    }
  }

  const top = frames.at(-1);
  const from = open?.start ?? cursor;
  const typed = open
    ? text.slice(open.start + (open.isString ? 1 : 0), cursor)
    : "";
  // The rest of a string the cursor is in, up to its closing quote.
  const rest = open?.isString
    ? (/^[^"\\\n,:{}[\]]*"/.exec(text.slice(cursor))?.[0] ?? "")
    : "";
  const to = cursor + rest.length;
  const base = { from, presentKeys: [] as string[], to, typed };

  if (!top) {
    // Outside every bracket: the whole list of arguments goes here.
    return frames.length === 0 && text.slice(0, from).trim() === ""
      ? { ...base, hasColon: false, kind: "value", path: [] }
      : { ...base, hasColon: false, kind: "none", path: [] };
  }

  if (top.isArray) {
    return top.state === "value"
      ? { ...base, hasColon: false, kind: "value", path: pathOf(frames, true) }
      : { ...base, hasColon: false, kind: "none", path: [] };
  }

  if (top.state === "key") {
    return {
      ...base,
      hasColon: /^\s*:/.test(text.slice(to)),
      kind: "key",
      path: pathOf(frames, false),
      presentKeys: top.keys,
    };
  }

  return top.state === "value"
    ? { ...base, hasColon: false, kind: "value", path: pathOf(frames, true) }
    : { ...base, hasColon: false, kind: "none", path: [] };
}

interface PathFacts {
  /** How many samples have each key in the object at this path. */
  keys: Map<string, number>;
  /** How many samples have an object at this path. */
  objectCount: number;
  /** The distinct values at this path, as JSON, with how many samples have each. */
  values: Map<string, number>;
}

/** What the samples hold at every path, counted once per sample. */
function indexSamples(samples: unknown[][]): Map<string, PathFacts> {
  const index = new Map<string, PathFacts>();

  for (const sample of samples) {
    const seen = new Set<string>();
    const once = (mark: string, count: () => void) => {
      if (!seen.has(mark)) {
        seen.add(mark);
        count();
      }
    };
    const factsOf = (path: string[]) => {
      const id = JSON.stringify(path);
      let facts = index.get(id);

      if (!facts) {
        facts = { keys: new Map(), objectCount: 0, values: new Map() };
        index.set(id, facts);
      }

      return { facts, id };
    };
    const visit = (value: unknown, path: string[]) => {
      const { facts, id } = factsOf(path);
      const json = JSON.stringify(value);

      once(`v\n${id}\n${json}`, () =>
        facts.values.set(json, (facts.values.get(json) ?? 0) + 1),
      );

      if (Array.isArray(value)) {
        value.forEach((item, position) =>
          visit(item, [...path, path.length === 0 ? String(position) : "*"]),
        );
      } else if (value !== null && typeof value === "object") {
        once(`o\n${id}`, () => facts.objectCount++);

        for (const [key, child] of Object.entries(value)) {
          once(`k\n${id}\n${key}`, () =>
            facts.keys.set(key, (facts.keys.get(key) ?? 0) + 1),
          );
          visit(child, [...path, key]);
        }
      }
    };

    visit(sample, []);
  }

  return index;
}

export interface InputCompletion {
  /** How many of the recent runs have this key or value. */
  detail: string;
  /** The text that replaces `from` to `to`. */
  insert: string;
  kind: "key" | "value";
  label: string;
}

export interface InputCompletions {
  from: number;
  options: InputCompletion[];
  to: number;
}

function matches(candidate: string, typed: string): number {
  const text = candidate.toLowerCase();
  const needle = typed.toLowerCase();

  return text.startsWith(needle) ? 0 : text.includes(needle) ? 1 : -1;
}

function shorten(text: string): string {
  return text.length > MAX_LABEL_LENGTH
    ? `${text.slice(0, MAX_LABEL_LENGTH - 1)}…`
    : text;
}

/**
 * What to offer at the cursor: the keys that recent runs have in the object
 * under the cursor and this input lacks, or the values that recent runs have
 * at this place. The most common come first.
 */
export function suggestInputCompletions(args: {
  cursor: number;
  samples: unknown[][];
  text: string;
}): InputCompletions | null {
  const { cursor, samples, text } = args;
  const context = inputContextAt(text, cursor);
  const facts =
    context.kind === "none"
      ? undefined
      : indexSamples(samples).get(JSON.stringify(context.path));

  if (!facts) {
    return null;
  }

  const counted =
    context.kind === "key"
      ? [...facts.keys].filter(([key]) => !context.presentKeys.includes(key))
      : [...facts.values];
  const options = counted
    .map(([item, count]) => {
      const value: unknown =
        context.kind === "value" ? JSON.parse(item) : undefined;
      // A text value is matched by what it says, without its quotes.
      const rank = matches(
        typeof value === "string" ? value : item,
        context.typed,
      );

      return { count, item, rank, value };
    })
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank || b.count - a.count)
    .slice(0, MAX_OPTIONS)
    .map<InputCompletion>(({ count, item, value }) => ({
      detail: `${count} of ${samples.length} runs`,
      insert:
        context.kind === "key"
          ? `${JSON.stringify(item)}${context.hasColon ? "" : ": "}`
          : context.path.length === 0
            ? JSON.stringify(value, null, 2)
            : item,
      kind: context.kind as "key" | "value",
      label: context.kind === "key" ? item : shorten(item),
    }));

  return options.length > 0
    ? { from: context.from, options, to: context.to }
    : null;
}

export interface InputDifferences {
  /** Keys that every recent run passes and this input does not. */
  missing: string[];
  /** Keys of this input that no recent run passes. */
  unknown: string[];
}

/**
 * Compares the keys of each argument with the same argument of recent runs. A
 * key that all of them pass and this input lacks is likely forgotten; a key
 * that none of them passes is likely misspelled.
 */
export function compareInputWithSamples(
  input: unknown[],
  samples: unknown[][],
): InputDifferences {
  const index = indexSamples(samples);
  const differences: InputDifferences = { missing: [], unknown: [] };

  input.forEach((argument, position) => {
    const facts = index.get(JSON.stringify([String(position)]));

    if (
      !facts ||
      facts.objectCount === 0 ||
      argument === null ||
      typeof argument !== "object" ||
      Array.isArray(argument)
    ) {
      return;
    }

    const name = (key: string) =>
      input.length > 1 ? `${key} (argument ${position + 1})` : key;

    for (const [key, count] of facts.keys) {
      if (count === facts.objectCount && !(key in argument)) {
        differences.missing.push(name(key));
      }
    }

    for (const key of Object.keys(argument)) {
      if (!facts.keys.has(key)) {
        differences.unknown.push(name(key));
      }
    }
  });

  return differences;
}
