import type { StudioStreamSearchConfig } from "../../../hooks/use-stream-details";

type StreamSearchToken =
  | { kind: "word"; value: string }
  | { kind: "string"; value: string }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "colon" }
  | { kind: "op"; value: "=" | ">" | ">=" | "<" | "<=" }
  | { kind: "minus" };

type StreamSearchComparisonOperator = Extract<
  StreamSearchToken,
  { kind: "op" }
>["value"];

export interface StreamSearchQueryValidation {
  isValid: boolean;
  message: string | null;
}

function tokenizeStreamSearchQuery(input: string): {
  errorMessage: string | null;
  tokens: StreamSearchToken[] | null;
} {
  const tokens: StreamSearchToken[] = [];
  let index = 0;

  while (index < input.length) {
    const character = input[index];

    if (character === undefined) {
      return {
        errorMessage: "The search query could not be parsed.",
        tokens: null,
      };
    }

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if (character === "(") {
      tokens.push({ kind: "lparen" });
      index += 1;
      continue;
    }

    if (character === ")") {
      tokens.push({ kind: "rparen" });
      index += 1;
      continue;
    }

    if (character === ":") {
      tokens.push({ kind: "colon" });
      index += 1;
      continue;
    }

    if (character === "-") {
      tokens.push({ kind: "minus" });
      index += 1;
      continue;
    }

    if (character === ">" || character === "<" || character === "=") {
      if (
        (character === ">" || character === "<") &&
        input[index + 1] === "="
      ) {
        tokens.push({
          kind: "op",
          value: character === ">" ? ">=" : "<=",
        });
        index += 2;
        continue;
      }

      tokens.push({
        kind: "op",
        value: character,
      });
      index += 1;
      continue;
    }

    if (character === '"') {
      let nextValue = "";
      index += 1;

      while (index < input.length) {
        const current = input[index];

        if (current === "\\") {
          if (index + 1 >= input.length) {
            return {
              errorMessage:
                'The quoted value ends with a trailing "\\". Escape another character or remove the backslash.',
              tokens: null,
            };
          }

          nextValue += input[index + 1];
          index += 2;
          continue;
        }

        if (current === '"') {
          break;
        }

        nextValue += current;
        index += 1;
      }

      if (index >= input.length || input[index] !== '"') {
        return {
          errorMessage:
            'The quoted value is not closed. Add a matching double quote (").',
          tokens: null,
        };
      }

      index += 1;
      tokens.push({
        kind: "string",
        value: nextValue,
      });
      continue;
    }

    let nextIndex = index;

    while (nextIndex < input.length) {
      const current = input[nextIndex];

      if (current === undefined) {
        return {
          errorMessage: "The search query could not be parsed.",
          tokens: null,
        };
      }

      if (
        /\s/.test(current) ||
        current === "(" ||
        current === ")" ||
        current === ":" ||
        current === ">" ||
        current === "<" ||
        current === "="
      ) {
        break;
      }

      nextIndex += 1;
    }

    const word = input.slice(index, nextIndex);

    if (word.length === 0) {
      return {
        errorMessage: "The search query could not be parsed.",
        tokens: null,
      };
    }

    tokens.push({
      kind: "word",
      value: word,
    });
    index = nextIndex;
  }

  return {
    errorMessage: null,
    tokens,
  };
}

class StreamSearchParser {
  private errorMessage: string | null = null;

  constructor(
    private readonly tokens: StreamSearchToken[],
    private readonly searchConfig?: StudioStreamSearchConfig | null,
    private position = 0,
  ) {}

  parse(): StreamSearchQueryValidation {
    const parsed = this.parseOr();

    if (!parsed) {
      return {
        isValid: false,
        message: this.errorMessage ?? "The search query is invalid.",
      };
    }

    if (!this.isAtEnd()) {
      this.fail(
        this.describeUnexpectedToken(this.tokens[this.position] ?? null),
      );

      return {
        isValid: false,
        message: this.errorMessage ?? "The search query is invalid.",
      };
    }

    return {
      isValid: true,
      message: null,
    };
  }

  private parseOr(): boolean {
    if (!this.parseAnd("Add a search clause before or after OR.")) {
      return false;
    }

    while (this.peekWord("OR")) {
      this.position += 1;

      if (!this.parseAnd('Expected a search clause after "OR".')) {
        return false;
      }
    }

    return true;
  }

  private parseAnd(missingMessage: string): boolean {
    if (!this.parseUnary()) {
      this.fail(missingMessage);
      return false;
    }

    while (
      !this.isAtEnd() &&
      !this.peekKind("rparen") &&
      !this.peekWord("OR")
    ) {
      if (this.peekWord("AND")) {
        this.position += 1;
      }

      if (!this.parseUnary()) {
        this.fail('Expected a search clause after "AND".');
        return false;
      }
    }

    return true;
  }

  private parseUnary(): boolean {
    if (this.peekWord("NOT")) {
      this.position += 1;

      if (!this.parseUnary()) {
        this.fail('Expected a search clause after "NOT".');
        return false;
      }

      return true;
    }

    if (this.peekKind("minus")) {
      this.position += 1;

      if (!this.parseUnary()) {
        this.fail('Expected a search clause after "-".');
        return false;
      }

      return true;
    }

    return this.parsePrimary();
  }

  private parsePrimary(): boolean {
    if (this.peekKind("lparen")) {
      this.position += 1;

      if (!this.parseOr()) {
        this.fail('Expected a search clause after "(".');
        return false;
      }

      if (!this.peekKind("rparen")) {
        this.fail('The grouped search is missing a closing ")".');
        return false;
      }

      this.position += 1;
      return true;
    }

    const token = this.consumeWordOrString();

    if (!token) {
      this.fail(
        this.describeUnexpectedToken(this.tokens[this.position] ?? null),
      );
      return false;
    }

    if (token.kind === "word" && this.peekKind("colon")) {
      this.position += 1;

      if (token.value === "has") {
        const fieldToken = this.consumeWord();

        if (fieldToken === null) {
          this.fail('Expected a field name after "has:".');
          return false;
        }

        return true;
      }

      if (token.value === "contains") {
        this.fail(
          '"contains:" is not supported here. Use a plain text term or a fielded clause such as metric:"process.rss.bytes".',
        );
        return false;
      }

      let operatorValue: StreamSearchComparisonOperator | null = null;

      const operatorToken = this.tokens[this.position];

      if (operatorToken?.kind === "op") {
        operatorValue = operatorToken.value;
        this.position += 1;
      }

      const valueToken = this.consumeWordOrString();

      if (valueToken === null) {
        this.fail(
          getMissingFieldValueMessage({
            fieldName: token.value,
            operatorValue,
            searchConfig: this.searchConfig,
          }),
        );
        return false;
      }

      return true;
    }

    return true;
  }

  private consumeWord() {
    const token = this.tokens[this.position];

    if (!token || token.kind !== "word") {
      return null;
    }

    this.position += 1;
    return token;
  }

  private consumeWordOrString() {
    const token = this.tokens[this.position];

    if (!token || (token.kind !== "word" && token.kind !== "string")) {
      return null;
    }

    this.position += 1;
    return token;
  }

  private isAtEnd() {
    return this.position >= this.tokens.length;
  }

  private peekKind(kind: StreamSearchToken["kind"]) {
    return this.tokens[this.position]?.kind === kind;
  }

  private peekWord(value: string) {
    const token = this.tokens[this.position];

    return token?.kind === "word" && token.value.toUpperCase() === value;
  }

  private fail(message: string) {
    if (this.errorMessage === null) {
      this.errorMessage = message;
    }
  }

  private describeUnexpectedToken(token: StreamSearchToken | null) {
    if (!token) {
      return "Expected a search term or fielded clause.";
    }

    if (token.kind === "rparen") {
      return 'Unexpected ")" without a matching "(".';
    }

    if (token.kind === "colon") {
      return 'Unexpected ":". Add a field name before it.';
    }

    if (token.kind === "op") {
      return `Unexpected operator "${token.value}". Add a fielded clause before it.`;
    }

    if (token.kind === "minus") {
      return 'Expected a search clause after "-".';
    }

    return "The search query is invalid.";
  }
}

function resolveSearchFieldConfig(args: {
  fieldName: string;
  searchConfig?: StudioStreamSearchConfig | null;
}) {
  const resolvedFieldName =
    args.searchConfig?.aliases[args.fieldName] ?? args.fieldName;

  return args.searchConfig?.fields[resolvedFieldName] ?? null;
}

function getMissingFieldValueMessage(args: {
  fieldName: string;
  operatorValue: StreamSearchComparisonOperator | null;
  searchConfig?: StudioStreamSearchConfig | null;
}) {
  const operatorSuffix = args.operatorValue ?? "";
  const fieldPrefix = `${args.fieldName}:${operatorSuffix}`;
  const field = resolveSearchFieldConfig(args);

  if (field?.kind === "integer" || field?.kind === "float") {
    return `Expected a numeric value after "${fieldPrefix}". Supported forms: number literal, > number literal, >= number literal, < number literal, <= number literal.`;
  }

  if (field?.kind === "bool") {
    return `Expected a boolean value after "${fieldPrefix}". Supported forms: true, false.`;
  }

  if (field?.kind === "date") {
    return `Expected a date value after "${fieldPrefix}". Supported forms: date literal, > date literal, >= date literal, < date literal, <= date literal.`;
  }

  return `Expected a value after "${fieldPrefix}".`;
}

export function validateStreamSearchQuery(
  value: string,
  searchConfig?: StudioStreamSearchConfig | null,
): StreamSearchQueryValidation {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return {
      isValid: true,
      message: null,
    };
  }

  const tokenizationResult = tokenizeStreamSearchQuery(trimmedValue);

  if (!tokenizationResult.tokens) {
    return {
      isValid: false,
      message:
        tokenizationResult.errorMessage ?? "The search query is invalid.",
    };
  }

  return new StreamSearchParser(
    tokenizationResult.tokens,
    searchConfig,
  ).parse();
}

export function canApplyStreamSearchQuery(
  value: string,
  searchConfig?: StudioStreamSearchConfig | null,
): boolean {
  return validateStreamSearchQuery(value, searchConfig).isValid;
}
