---
description: End-of-session routine - update status/history, verify green, push
---

End-of-session wrap-up for SIEAmB:

1. Update `.claude/context/STATUS.md`: refresh "Last updated" date, "Where we are", "What works", "Next steps" based on what we did this session.
2. Append a dated entry to `.claude/context/HISTORY.md` describing this session's changes and decisions (newest first).
3. Run the full check: `npm run lint && npm run typecheck && npm run test`, and `npm run test:e2e` if frontend behavior changed.
4. Commit everything with a descriptive message and push to `main`.
5. Confirm CI + Pages deploy went green (`gh run list --limit 2`, wait for completion).
6. Remind me of anything left half-done or blocked on external people.
