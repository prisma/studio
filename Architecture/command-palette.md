# Command Palette Architecture

This document is normative for the Studio `Cmd/Ctrl+K` command palette.

## State Contract

- Palette open/closed state MUST be stored in TanStack DB local UI state via `useUiState` with a deterministic Studio-wide key.
- The palette query text MUST remain local React state because it is high-frequency transient input.
- Current-view action registrations MAY live in React context because they carry non-serializable callbacks. They are a behavior registry, not persisted UI state.

## UI Contract

- `Cmd+K` and `Ctrl+K` MUST open the palette from any Studio view and focus the search input immediately.
- The palette shell MUST be composed from the standard ShadCN [`Dialog`](../ui/components/ui/dialog.tsx) and [`Command`](../ui/components/ui/command.tsx) primitives. Custom logic MAY shape the sections and query interpretation, but MUST NOT replace the modal shell or command-list primitives with bespoke markup.
- The top section MUST contain actions registered by the active view. In table view this includes row search, AI filtering, staged save/discard actions when edits are pending, insert row, refresh, and pagination actions.
- The next section MUST show table navigation results for the active schema. With no query it shows the first 3 tables; with a query it shows the top 3 matches.
- When more than 3 tables exist, the tables section MUST append an `x more...` affordance. Selecting it MUST close the palette and hand off to the existing sidebar table-search UI, opening that input and seeding it with the current palette query.
- The next section MUST expose Studio appearance controls: a `Match system theme` toggle and a single-line `Studio theme` segmented control with `Light` and `Dark` options.
- The final section MUST expose navigation to `Visualizer`, `Console`, and `SQL`.
- Filtering MUST apply to commands and tables immediately as the user types.
- The palette popup MUST render inside the Studio `.ps` scope so it inherits Studio styling and remains centered as a modal surface in embedded hosts.
- The palette surface MUST explicitly use the Studio sans font stack so embedded hosts cannot accidentally change its typography.

## Query Interpretation Rules

- `Search rows` and `Filter with AI` MUST both exist as plain focus actions in table view.
- Typing any prefix of `Search rows` or `Filter with AI` MUST keep those commands in focus mode rather than converting them into direct-execute actions.
- Typing non-command free text MUST convert those commands into `Search rows: <query>` and `Filter with AI: <query>` direct actions.
- Direct row-search execution MUST write the payload into the shared row-search control and applied search state.
- Plain `Filter with AI` MUST focus the existing toolbar AI input, while direct `Filter with AI: <query>` MUST run the AI request immediately with that payload.

## Table Action Rules

- Table palette actions MUST delegate to the same underlying hooks and mutations as the visible table UI.
- Opening row search from the palette MUST go through the shared row-search UI state so the existing toolbar search control opens and receives focus.
- Direct row-search execution from the palette MUST go through the same row-search control state and URL-backed search term as manual typing.
- AI filtering from the palette MUST use the same AI resolution and URL-backed filter application path as the inline toolbar.
- Focusing AI filtering from the palette MUST go through the same toolbar input, not a separate hidden command-only state.
- Insert-row, refresh, and pagination actions MUST reuse the same table-view handlers and URL state used by the visible controls.
- When staged rows or staged updates exist, the palette MUST also surface the same `Save x rows` and `Discard edits` actions as the toolbar, and those actions MUST open the same confirmation flows rather than introducing palette-only mutation paths.

## Appearance Action Rules

- Appearance palette controls MUST write through the shared Studio UI state in [`ui/studio/context.tsx`](../ui/studio/context.tsx); they MUST NOT introduce a second theme store.
- The `Match system theme` control MUST behave as an on/off toggle. Turning it on MUST switch Studio back to the persisted `system` theme mode. Turning it off MUST keep the current resolved appearance by persisting either `light` or `dark`.
- When `Match system theme` is on, the manual `Studio theme` control MUST be disabled so the system color scheme is the only active theme source, with host document class fallback only when media queries are unavailable.
- The `Studio theme` control MUST persist explicit Studio-local `light` and `dark` overrides so embedded hosts cannot immediately overwrite them through incidental document-class churn.
- Both appearance rows MUST remain part of the command-item keyboard flow so arrow-key navigation can select them and `Enter` can toggle them in place.
- Toggling any appearance control from the palette MUST update the UI immediately and MUST NOT dismiss the palette.
