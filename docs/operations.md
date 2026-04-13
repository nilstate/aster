---
title: Operations
description: Secrets, approvals, artifacts, and what still needs hardening.
---

# Operations

## Required secrets

- `OPENAI_API_KEY`: external caller for `runx` `agent-step` requests
- `RUNX_CALLER_MODEL` (optional repo variable): pinned model snapshot for the
  hosted bridge

## Approval policy

Approvals stay explicit:

- Sourcey authoring auto-approves only `sourcey.discovery.approval`
- Issue-to-PR stays bounded by the issue template plus scafld review
- PR triage writes comments only through the dedicated workflow
- Skill-learning opens draft PRs only

## Artifact policy

Every mutating or public lane uploads:

- the final `runx` JSON result
- the receipts directory
- provider traces for each `agent-step`

That makes failures diagnosable and keeps the trust boundary visible.

## Still missing

- provider failover and key rotation
- stronger evals for comment quality and PR usefulness
- a merge and rollback policy for generated PRs
- persistent receipt indexing outside workflow artifacts
