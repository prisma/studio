import { describe, expect, it } from "vitest";

import {
  compareInputWithSamples,
  inputContextAt,
  suggestInputCompletions,
} from "./input-suggestions";

const samples: unknown[][] = [
  [{ customer: { id: "cus_1", region: "eu" }, plan: "starter", seats: 3 }],
  [{ customer: { id: "cus_2", region: "eu" }, plan: "pro", seats: 10 }],
  [{ customer: { id: "cus_3", region: "us" }, plan: "pro" }],
];

/** Suggestions for a text in which `|` marks the cursor. */
function suggest(marked: string) {
  const cursor = marked.indexOf("|");
  const text = marked.replace("|", "");
  const result = suggestInputCompletions({ cursor, samples, text });

  return {
    ...result,
    labels: result?.options.map((option) => option.label) ?? [],
    /** The text after the first suggestion is taken. */
    taken: result
      ? `${text.slice(0, result.from)}${result.options[0]!.insert}${text.slice(result.to)}`
      : text,
  };
}

describe("inputContextAt", () => {
  it("tells a key from a value and says where in the input the cursor is", () => {
    const at = (marked: string) => {
      const context = inputContextAt(
        marked.replace("|", ""),
        marked.indexOf("|"),
      );

      return [context.kind, context.path.join(".")];
    };

    expect(at("[{|")).toEqual(["key", "0"]);
    expect(at('[{"plan": |')).toEqual(["value", "0.plan"]);
    expect(at('[{"customer": {"id": "x", "re|')).toEqual(["key", "0.customer"]);
    expect(at('[{"plan": "pro"}, |')).toEqual(["value", "1"]);
    expect(at('[{"tags": ["a", |')).toEqual(["value", "0.tags.*"]);
    expect(at('[{"plan": "pro" |')).toEqual(["none", ""]);
    expect(at("|")).toEqual(["value", ""]);
  });
});

describe("suggestInputCompletions", () => {
  it("offers the keys of recent runs that the object lacks, the most common first", () => {
    const result = suggest('[{"plan": "pro", |}]');

    expect(result.labels).toEqual(["customer", "seats"]);
    expect(result.options![1]!.detail).toBe("2 of 3 runs");
    expect(result.taken).toBe('[{"plan": "pro", "customer": }]');
  });

  it("completes a key the user started, with or without its closing quote", () => {
    expect(suggest('[{"se|}]').taken).toBe('[{"seats": }]');
    expect(suggest('[{"se|"}]').taken).toBe('[{"seats": }]');
    // The colon is there already.
    expect(suggest('[{"pl|": "pro"}]').taken).toBe('[{"plan": "pro"}]');
  });

  it("offers the values recent runs have for a key, the most common first", () => {
    const result = suggest('[{"plan": |}]');

    expect(result.labels).toEqual(['"pro"', '"starter"']);
    expect(result.options![0]!.detail).toBe("2 of 3 runs");
    expect(result.taken).toBe('[{"plan": "pro"}]');
  });

  it("narrows the values by what the user typed inside the quotes", () => {
    expect(suggest('[{"plan": "st|"}]').taken).toBe('[{"plan": "starter"}]');
    // A value that starts with the typed text comes before one that holds it.
    expect(suggest('[{"customer": {"region": "u|').labels).toEqual([
      '"us"',
      '"eu"',
    ]);
    expect(suggest('[{"seats": 1|}]').labels).toEqual(["10"]);
  });

  it("offers a whole object where recent runs have one", () => {
    const result = suggest('[{"customer": |}]');

    expect(result.labels[0]).toBe('{"id":"cus_1","region":"eu"}');
  });

  it("offers the whole input of a recent run for an empty field", () => {
    const result = suggest("|");

    expect(result.options).toHaveLength(3);
    expect(JSON.parse(result.taken)).toEqual(samples[0]);
  });

  it("offers nothing where recent runs have nothing", () => {
    expect(suggest('[{"plan": "pro" |}]').options).toBeUndefined();
    expect(suggest('[{"unknown": |}]').options).toBeUndefined();
    expect(suggest('[{"zz|}]').options).toBeUndefined();
  });
});

describe("compareInputWithSamples", () => {
  it("names a key that every recent run passes and this input lacks", () => {
    // `seats` is in two of three runs, so it is not expected.
    expect(compareInputWithSamples([{ plan: "pro" }], samples)).toEqual({
      missing: ["customer"],
      unknown: [],
    });
  });

  it("names a key that no recent run passes", () => {
    expect(
      compareInputWithSamples(
        [{ customer: {}, plam: "pro", plan: "pro" }],
        samples,
      ).unknown,
    ).toEqual(["plam"]);
  });

  it("says nothing about an argument that recent runs do not have as an object", () => {
    expect(compareInputWithSamples(["text", { extra: 1 }], samples)).toEqual({
      missing: [],
      unknown: [],
    });
  });
});
