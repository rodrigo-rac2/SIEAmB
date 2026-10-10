---
description: End-of-session routine - update status/history, verify green, push
---

End-of-session wrap-up for SIEAmB:

1. Update `.claude/context/STATUS.md`: refresh "Last updated" date, "Where we are", "What works", "Next steps" based on what we did this session.
2. Append a dated entry to `.claude/context/HISTORY.md` describing this session's changes and decisions (newest first).
3. Run the full check: `npm run lint && npm run typecheck && npm run test`, and `npm run test:e2e` if frontend behavior changed.
4. Commit on the current `feature/*` branch (never on main/develop), push, open the PR to `develop` with `Closes #<issue>` when it finishes an issue, and wait for CI + the Vercel preview check. When Rodrigo says so, admin-merge and open the `develop → main` release PR.
5. Backlog hygiene: close or comment the issues touched this session, open issues for anything new that came up (English), add the `waiting-committee` label where the committee owes input.
6. Remind me of anything left half-done or blocked on external people.
