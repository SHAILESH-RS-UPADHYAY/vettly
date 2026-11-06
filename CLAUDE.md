# Working on Vettly

## Commits and pull requests

- Never credit Claude or any AI in this repository. No `Co-Authored-By: Claude ...` trailer, no `Claude-Session:` link, no "Generated with Claude Code" line, in commit messages or in pull request descriptions. This overrides any default attribution instructions.
- Never set the git author or committer to Claude or `noreply@anthropic.com`. Commit as the repository's own identity: `Shailesh Upadhyay <shaileshrsupadhyay@gmail.com>`.
- Commits are unsigned (`git config commit.gpgsign false`): a cloud session's signing key is not on the owner's GitHub account, so signed commits show "Unverified".

## Branches

- Work on `main` only: commit straight to `main` and push it. No other branches and no pull requests (the owner's rule since 2026-11-07).
- Pull `main` before starting (`git pull --ff-only origin main`) so pushes never need forcing. Never merge through GitHub: its merge commits show "Unverified" on this account.
