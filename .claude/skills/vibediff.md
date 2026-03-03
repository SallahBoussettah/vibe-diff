---
name: vibediff
description: Show VibeDiff semantic diff report for the current session
user_invocable: true
---

Run the VibeDiff report to show a semantic analysis of all code changes in the current session.

Execute this command and present the results to the user:

```bash
node D:/Plugins/vibe-diff/dist/cli.js report
```

If the user asks for markdown output, run:

```bash
node D:/Plugins/vibe-diff/dist/cli.js report --md
```

If the user asks for a commit message, run:

```bash
node D:/Plugins/vibe-diff/dist/cli.js commit-msg
```

If the user asks to clear the session, run:

```bash
node D:/Plugins/vibe-diff/dist/cli.js clear
```

Present the output directly to the user. The report includes: files changed, behavior changes, API changes, breaking changes, side effects, test impact, dependency changes, and risk assessment.
