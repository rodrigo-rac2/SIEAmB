---
description: Review and refresh the SIEAmB pending-items tracker
---

Review `.claude/log/PENDING.md` for this project:

1. Read the tracker and check each open item for movement:
   - P5 (Samuel's invite): `gh api repos/rodrigo-rac2/SIEAmB/collaborators/0Samuel09` (204 = accepted)
   - Git/PR items: `gh pr list`, `git log --oneline -10`
   - Items waiting on people (design, content, edital): ask Rodrigo if there's news from the WhatsApp group
2. For each item that moved: update the row, or move it to Resolved with date and resolution.
3. Flag loudly anything in "Owned by Rodrigo" that is due today or overdue.
4. New items mentioned in the conversation get added with owner, since-date, and a concrete "next check" note.
5. Summarize to Rodrigo: what moved, what's stuck and for how long, what he owes people.
6. Commit and push if anything changed (`Update pending items`).
