---
title: Dogfood Story
description: How automaton uses runx to improve itself gradually.
---

# Dogfood Story

`automaton` exists so `runx` can dogfood itself on a real public target.

## The loop

1. a real issue, PR, or schedule trigger enters the repo
2. a hosted workflow packages that trigger into a bounded `runx` invocation
3. `runx` pauses at each `agent-step`
4. an external caller bridge answers those steps without privileged shortcuts
5. the workflow resumes the run, records receipts, and applies the resulting
   bounded output
6. changes land as a draft PR or a posted PR comment, not as a hidden mutation

## Why this matters

- the repo becomes a public proof surface for governed automation
- every lane emits receipts instead of just claiming it worked
- failures can feed back into `improve-skill` and future skill hardening
- project evaluators can inspect the whole system from issue intake to PR
