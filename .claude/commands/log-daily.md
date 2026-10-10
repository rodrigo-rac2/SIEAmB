---
description: Append today's entry to the SIEAmB weekly log (project-local, NOT the personal weekly-log repo)
---

Daily log routine for THIS project (everything stays inside this repo — never write to ~/rac2/weekly-log):

1. Determine today's date and ISO week. The log file is `.claude/log/<year>-w<week>.md` (e.g. `2026-w36.md`). Create it with the header `# Week <N> — <monday> → <sunday>` if it doesn't exist.
2. Gather what happened today:
   - `git log --oneline --since=midnight` (all branches) and any open PRs (`gh pr list`)
   - What was discussed/decided in this session, including WhatsApp group developments Rodrigo reports
3. Append a `## <Day> <date>` section with subsections: **Done**, **Group/WhatsApp developments** (if any), **Blocked/waiting** (reference GitHub issue numbers, e.g. `#12`, instead of repeating details).
4. Cross-check the backlog: close issues finished today (or make sure the PR says `Closes #N`), open issues for new work discovered today, comment on `waiting-committee` issues when the committee answered.
5. If anything material changed (phase progress, new decisions), also refresh `.claude/context/STATUS.md`.
6. Commit with message `Log: <date>` on the current feature branch (or a `chore/log-<date>` branch) and open a PR to `develop`; never commit on main/develop directly.
