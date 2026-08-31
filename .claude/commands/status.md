---
description: Load SIEAmB project status and history to regroup in a new session
---

Read these files and summarize the current state of the project for me:

1. `.claude/context/STATUS.md` — current status, what's placeholder, next steps
2. `.claude/context/HISTORY.md` — what happened in past sessions
3. Run `git log --oneline -10` and `gh run list --limit 3` to check recent commits and CI/deploy health
4. Check if the live site is up: `curl -s -o /dev/null -w "%{http_code}" https://rodrigo-rac2.github.io/SIEAmB/`

Then give me a short summary: where we are, what's blocked on external people (committee content, design identity), and what I can work on right now. If STATUS.md looks stale compared to git log, flag that and offer to update it.
