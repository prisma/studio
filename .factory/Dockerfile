# The factory run environment, built by .github/workflows/factory-image.yml and pulled
# by every job. Keep it lean — a fat image costs pull time on every run. No secrets and
# no repo code live here; both arrive at run time.
#
# Node major tracks .node-version (24.x); pnpm tracks the packageManager field in
# package.json. Bump both here when those change.
FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates jq ripgrep unzip \
    && rm -rf /var/lib/apt/lists/*

# GitHub CLI — the loops' hands (issues, PRs, labels, reviews).
RUN mkdir -p -m 755 /etc/apt/keyrings \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
       -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
       > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# The agent.
RUN npm install -g @anthropic-ai/claude-code

# ── This repo's toolchain ────────────────────────────────────────────────────────────
# pnpm, pinned to the version package.json's `packageManager` field names. corepack
# reads that field at run time, so the pin here only needs to match the major.
RUN corepack enable && corepack prepare pnpm@8.15.9 --activate

# Bun — used by `build:deploy` and the demo scripts (demo/ppg-dev/*.ts). Not needed for
# the local gates, but cheap, and it keeps the image able to run everything in
# package.json. Version matches the one the compute-preview workflow installs.
ENV BUN_INSTALL=/usr/local/bun
ENV PATH="${BUN_INSTALL}/bin:${PATH}"
RUN curl -fsSL https://bun.sh/install | bash -s -- bun-v1.3.12 \
    && bun --version

# vitest's `ui` project runs under happy-dom (pure JS) and the `data` project uses
# in-process engines (pglite, sql.js, node:sqlite) — no browser, no database service
# needed. MySQL integration suites self-skip without STUDIO_MYSQL_TEST_URL.
