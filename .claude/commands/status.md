---
description: Load SIEAmB project status and history to regroup in a new session
---

Read these files and summarize the current state of the project for me:

1. `.claude/context/STATUS.md` — current status, what's placeholder, next steps
2. `.claude/context/HISTORY.md` — what happened in past sessions
3. Run `git log --oneline -10` and `gh run list --limit 3` to check recent commits and CI health
4. Check both environments are up: `curl -s -o /dev/null -w "%{http_code}" https://sieamb.org/` and the same for `https://dev.sieamb.org/`
5. Backlog: `gh issue list --state open --limit 50` grouped by milestone (`gh api repos/rodrigo-rac2/SIEAmB/milestones --jq '.[] | "\(.title): \(.open_issues) open, due \(.due_on)"'`). Issues labelled `waiting-committee` are blocked on the organising committee.

Then give me a short summary: where we are, what's blocked on external people, and which issue in the nearest milestone I can work on right now. If STATUS.md looks stale compared to git log, flag that and offer to update it.
