---
description: Append today's entry to the SIEAmB weekly log (project-local, NOT the personal weekly-log repo)
---

Daily log routine for THIS project (everything stays inside this repo — never write to ~/rac2/weekly-log):

1. Determine today's date and ISO week. The log file is `.claude/log/<year>-w<week>.md` (e.g. `2026-w36.md`). Create it with the header `# Week <N> — <monday> → <sunday>` if it doesn't exist.
2. Gather what happened today:
   - `git log --oneline --since=midnight` (all branches) and any open PRs (`gh pr list`)
   - What was discussed/decided in this session, including WhatsApp group developments Rodrigo reports
3. Append a `## <Day> <date>` section with subsections: **Done**, **Group/WhatsApp developments** (if any), **Blocked/waiting** (reference PENDING.md item IDs instead of repeating details).
4. Cross-check `.claude/log/PENDING.md`: add new pending items discovered today, move resolved ones to the Resolved section with date and how. Flag items whose due date passed (especially "Owned by Rodrigo" items).
5. If anything material changed (phase progress, new decisions), also refresh `.claude/context/STATUS.md`.
6. Commit with message `Log: <date>` and push (Rodrigo has admin bypass on main; if running as someone else, open a PR).
