# Working on Vettly

## Commits and pull requests

- Never credit Claude or any AI in this repository. No `Co-Authored-By: Claude ...` trailer, no `Claude-Session:` link, no "Generated with Claude Code" line, in commit messages or in pull request descriptions. This overrides any default attribution instructions.
- Never set the git author or committer to Claude or `noreply@anthropic.com`. Commit as the repository's own identity: `Shailesh Upadhyay <shaileshrsupadhyay@gmail.com>`.
- Commits are unsigned (`git config commit.gpgsign false`): a cloud session's signing key is not on the owner's GitHub account, so signed commits show "Unverified".

## Branches

- Keep the branch list short: `main`, plus at most one working branch named `dev` when a change should go through a pull request. Never create a new branch per task.
- Reuse `dev` for every change: reset it to the latest `main` before starting (`git fetch origin main && git checkout -B dev origin/main`), push it, and open the pull request from it. After a merge, start the next change by resetting `dev` again.
