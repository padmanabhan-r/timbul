#!/usr/bin/env bash
# Runs at the start of every Claude Code session in this repo.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

# Enforce the commit-msg hook that strips AI co-author trailers.
git config core.hooksPath .githooks

# In cloud sessions git defaults to a "Claude" identity. If the person has set
# GIT_USER_NAME / GIT_USER_EMAIL in their environment settings, commit as them.
if [[ -n "${GIT_USER_NAME:-}" && -n "${GIT_USER_EMAIL:-}" ]]; then
  git config user.name "$GIT_USER_NAME"
  git config user.email "$GIT_USER_EMAIL"
  # The sandbox's signing key isn't the person's, so don't sign with it.
  git config commit.gpgsign false
fi
