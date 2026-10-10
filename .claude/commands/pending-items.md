---
description: Review the SIEAmB backlog (GitHub Issues) and what is blocked on the committee
---

The SIEAmB backlog lives in GitHub Issues (English), ordered by milestone. `.claude/log/PENDING.md` is retired.

1. List open issues by milestone: `gh issue list --state open --limit 100 --json number,title,milestone,labels,assignees`.
2. For `waiting-committee` issues, ask Rodrigo if there is news from the WhatsApp group; when the input arrives, drop the label and add the details as a comment on the issue.
3. Flag loudly any milestone whose due date is within 7 days with open issues, and any issue nobody is working on in the nearest milestone.
4. Check Samuel's collaborator status once: `gh api repos/rodrigo-rac2/SIEAmB/collaborators/0Samuel09` (204 = accepted).
5. New work mentioned in the conversation becomes an issue (`gh issue create`), with milestone and one label. Ask Rodrigo before creating more than a couple at once.
6. Summarize: what moved, what is stuck and for how long, what Rodrigo owes the committee.
