import type { TemporalFailureInfo } from "./types";

/** One line of a stack trace: a call, and where its code is. */
export interface StackFrame {
  column?: number;
  file?: string;
  functionName?: string;
  /** True for code the user did not write: an SDK, a dependency, the runtime. */
  isLibrary: boolean;
  line?: number;
  raw: string;
}

const LIBRARY_MARKS = [
  "node_modules/",
  "node:",
  "bun:",
  "@temporalio/",
  "site-packages/",
  "/lib/python",
  "temporalio/",
  "go.temporal.io/",
  "/go/pkg/mod/",
  "/usr/local/go/",
  "io.temporal.",
  "java.base/",
  "java.",
  "jdk.",
  "<anonymous>",
  "native",
];

function isLibraryFrame(file: string | undefined, functionName?: string) {
  const text = `${file ?? ""} ${functionName ?? ""}`;

  return (
    file === undefined || LIBRARY_MARKS.some((mark) => text.includes(mark))
  );
}

function frameOf(
  raw: string,
  functionName: string | undefined,
  file: string | undefined,
  line?: string,
  column?: string,
): StackFrame {
  const name = functionName?.replace(/^async /, "").trim();

  return {
    ...(column ? { column: Number(column) } : {}),
    ...(file ? { file } : {}),
    ...(name ? { functionName: name } : {}),
    isLibrary: isLibraryFrame(file, name),
    ...(line ? { line: Number(line) } : {}),
    raw,
  };
}

/**
 * Reads the frames of a stack trace as the Temporal SDKs write it: JavaScript
 * and TypeScript (`at fn (file:1:2)`), Python (`File "x.py", line 1, in fn`),
 * Java (`at pkg.Class.method(File.java:1)`) and Go (the function on one line,
 * `file.go:1` on the next). A line that is no frame, such as the message at
 * the top, is left out.
 */
export function parseStackTrace(stackTrace: string | undefined): StackFrame[] {
  const lines = (stackTrace ?? "").split("\n");
  const frames: StackFrame[] = [];

  lines.forEach((line, index) => {
    const raw = line.trim();
    const javaScript =
      /^at (?:(.+?) \()?((?:file:\/\/)?[^()\s]+?):(\d+):(\d+)\)?$/.exec(raw);
    const java = /^at ([\w.$<>]+)\(([^:()]+):(\d+)\)$/.exec(raw);
    const python = /^File "([^"]+)", line (\d+), in (.+)$/.exec(raw);
    const go = /^(\/?[^\s:]+\.go):(\d+)(?: \+0x[0-9a-f]+)?$/.exec(raw);

    if (javaScript) {
      frames.push(
        frameOf(
          raw,
          javaScript[1],
          javaScript[2],
          javaScript[3],
          javaScript[4],
        ),
      );
    } else if (java) {
      frames.push(frameOf(raw, java[1], java[2], java[3]));
    } else if (python) {
      frames.push(frameOf(raw, python[3], python[1], python[2]));
    } else if (go) {
      // Go writes the function on the line before the file.
      const functionName = lines[index - 1]?.trim().replace(/\(.*\)$/, "");

      frames.push(frameOf(raw, functionName, go[1], go[2]));
    }
  });

  return frames;
}

/** The failure at the end of the chain of causes: the one that holds the reason. */
export function rootCauseOf(failure: TemporalFailureInfo): TemporalFailureInfo {
  let root = failure;

  while (root.cause) {
    root = root.cause;
  }

  return root;
}

/**
 * The frame in the user's own code where a failure was thrown: the first frame
 * of the root cause that is not library code. Studio does not have the
 * Worker's source, so the function, file and line are the most it can name.
 */
export function failureOrigin(failure: TemporalFailureInfo): StackFrame | null {
  const frames = [
    ...parseStackTrace(rootCauseOf(failure).stackTrace),
    ...parseStackTrace(failure.stackTrace),
  ];

  return frames.find((frame) => !frame.isLibrary) ?? null;
}

/** The last parts of a path, which name the file without the deploy directory. */
export function shortenPath(file: string, parts = 3): string {
  const segments = file.replace(/^file:\/\//, "").split("/");

  return segments.length > parts ? segments.slice(-parts).join("/") : file;
}

const RETRY_STATES: Record<string, string> = {
  CANCEL_REQUESTED: "Not retried: a cancellation was requested.",
  INTERNAL_SERVER_ERROR: "Not retried: the server had an internal error.",
  IN_PROGRESS: "The server retries it.",
  MAXIMUM_ATTEMPTS_REACHED:
    "Not retried: it reached the maximum number of attempts.",
  NON_RETRYABLE_FAILURE: "Not retried: the failure is marked non-retryable.",
  RETRY_POLICY_NOT_SET: "Not retried: it has no Retry Policy.",
  TIMEOUT: "Not retried: its Schedule-To-Close timeout passed.",
};

/** Why the server did or did not retry, from the `retryState` of a failure. */
export function describeRetryState(
  retryState: string | undefined,
): string | undefined {
  return retryState ? RETRY_STATES[retryState] : undefined;
}
