# SQL AI Generation Architecture

This document is normative for natural-language SQL generation in Studio (`view=sql`).

The implementation MUST reuse the embedder-provided AI transport, write generated SQL into the editor without auto-running it, and hand focus back to the SQL editor so execution stays an explicit user action.

## Scope

This architecture governs:

- the optional SQL-view AI generation affordance
- prompt construction from live introspection metadata
- response validation and retry behavior
- how generated SQL is written into editor state and executed
- demo wiring for the local Anthropic-backed example

## Canonical Components

- [`ui/studio/views/sql/SqlView.tsx`](../ui/studio/views/sql/SqlView.tsx)
- [`ui/studio/views/sql/sql-ai-generation.ts`](../ui/studio/views/sql/sql-ai-generation.ts)
- [`ui/studio/views/sql/ai-json-response.ts`](../ui/studio/views/sql/ai-json-response.ts)
- [`ui/studio/context.tsx`](../ui/studio/context.tsx)
- [`ui/studio/Studio.tsx`](../ui/studio/Studio.tsx)
- [`demo/ppg-dev/DemoShell.tsx`](../demo/ppg-dev/DemoShell.tsx)
- [`demo/ppg-dev/server.ts`](../demo/ppg-dev/server.ts)
- [`demo/ppg-dev/anthropic.ts`](../demo/ppg-dev/anthropic.ts)

## Frontend Contract

- AI SQL generation MUST remain optional. If `llm` is not provided, the SQL view MUST NOT render an empty AI affordance.
- The SQL view MUST expose a single inline prompt plus action button in the existing header controls, alongside the normal `Run query` flow.
- Submitted AI SQL requests MUST be persisted in Studio's local SQL-view TanStack collection so prompt history survives remounts.
- When the AI prompt input is focused and empty, `ArrowUp` / `ArrowDown` MUST cycle saved prompts as placeholder-only preview text rather than immediately mutating the input value.
- When a history preview is active, clicking into the input or pressing any non-history key MUST materialize that preview into the real input before normal editing continues.
- Submitting a prompt MUST replace the current editor contents with the generated SQL text.
- Submitting a prompt MUST focus the SQL editor and place the cursor at the end of the generated statement so `Cmd/Ctrl+Enter` or the existing run button can execute it immediately.
- AI-generation loading and error states MUST stay inline inside the SQL view and MUST NOT break the normal editor/result layout.

## Prompt Construction Contract

- Prompt construction MUST use current live introspection metadata rather than stale cached schema text.
- The prompt context MUST be bounded:
  - include the concrete database engine name and dialect
  - include adapter dialect
  - include current schema when available
  - include table names and column metadata needed to write valid SQL
  - exclude row data and query results
- The model contract MUST require strict JSON with:
  - `sql`: generated SQL text
  - `rationale`: short human-readable explanation
  - `shouldGenerateVisualization`: whether the resulting dataset is worth auto-charting
- The prompt MUST explicitly instruct the model to return SQL only inside the JSON payload, not markdown code fences.
- The prompt MUST ask the model to decide whether the expected result would produce an interesting chart, rather than auto-charting every AI-generated query.

## Validation and Retry Contract

- Studio MUST parse the AI response before updating editor state.
- JSON-response validation and correction retries SHOULD flow through the shared SQL-view AI JSON utility rather than bespoke per-feature retry loops.
- If the initial AI response is not valid JSON or does not satisfy the `{ sql, rationale, shouldGenerateVisualization }` contract, Studio MUST retry once with a correction prompt that includes the invalid raw response.
- Provider-level output-limit failures MUST surface as explicit retry issues instead of collapsing into a generic malformed-JSON error.
- If the retry still fails validation, Studio MUST surface an inline error and MUST leave the current editor contents unchanged.
- Successful responses MAY surface the rationale inline to explain what was generated.
- Successful responses MUST carry the visualization decision forward so the next manual execution of that same AI-generated SQL can auto-generate a chart for graph-worthy results.

## Embedder and Demo Contract

- Embedders own the actual provider call through one shared `llm({ task, prompt })` hook.
- The local demo MAY implement `llm` with Anthropic, but that transport MUST follow the same logging guardrails as AI filtering and MUST NOT log provider keys or raw prompts.
- Demo config MAY disable the shared `llm` hook at embed time, even when the provider credentials exist.

## Testing Requirements

Changes to AI SQL generation MUST include tests covering:

- prompt context bounding and JSON-contract enforcement
- correction retry behavior for malformed AI responses
- SQL-view integration showing controls only when configured
- local prompt-history persistence plus placeholder-preview navigation with `ArrowUp` / `ArrowDown`
- filling the editor without auto-executing the generated query
- focusing the editor and moving the cursor to the end of the generated SQL
- preserving the visualization decision until the user manually runs the generated SQL
- surfacing the visualization decision from the AI response
- inline error rendering for failed AI generation
