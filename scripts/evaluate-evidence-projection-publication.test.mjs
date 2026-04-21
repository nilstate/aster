import test from "node:test";
import assert from "node:assert/strict";

import { evaluateEvidenceProjectionPublication } from "./evaluate-evidence-projection-publication.mjs";

test("evaluateEvidenceProjectionPublication suppresses publication for state-only compaction", () => {
  const decision = evaluateEvidenceProjectionPublication({
    latestBatch: {
      applied_summaries: 0,
      suppressed_summaries: 0,
      public_projection_groups: 0,
      error_count: 0,
    },
    changeSummary: {
      file_count: 1,
      additions: 3,
      deletions: 135,
      files: ["state/evidence-projections.json"],
    },
  });

  assert.equal(decision.status, "noop");
  assert.equal(decision.reason, "state_only_projection_compaction");
});

test("evaluateEvidenceProjectionPublication requires publication when public projection files changed", () => {
  const decision = evaluateEvidenceProjectionPublication({
    latestBatch: {
      applied_summaries: 1,
      suppressed_summaries: 0,
      public_projection_groups: 1,
      error_count: 0,
    },
    changeSummary: {
      file_count: 2,
      additions: 64,
      deletions: 0,
      files: [
        "history/2026-04-21-issue-triage-example.md",
        "state/evidence-projections.json",
      ],
    },
  });

  assert.equal(decision.status, "publish");
  assert.equal(decision.reason, "publication_required");
});
