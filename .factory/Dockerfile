# The factory run environment, built by .github/workflows/factory-image.yml and pulled
# by every job. Keep it lean — a fat image costs pull time on every run. No secrets and
# no repo code live here; both arrive at run time.
#
# Node is here only because the Claude Code CLI needs it; the major tracks .node-version.
FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates jq ripgrep \
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

# ── Deliberately NO repo toolchain ───────────────────────────────────────────────────
# The loops never execute repository code (see FACTORY.md § Local gates): tests, lint,
# and build run in the credential-free `ci` workflow, while this image holds the bot's
# credentials. Keeping pnpm and bun out of the image is part of that boundary — don't
# add them back.
