import test from "node:test";
import assert from "node:assert/strict";

import { deriveThreadTeachingContext } from "./thread-teaching.mjs";

test("deriveThreadTeachingContext emits gate authorizations from approval records", () => {
  const context = deriveThreadTeachingContext([
    {
      source_type: "issue_comment",
      author: "kam",
      author_association: "OWNER",
      body: [
        "<!-- aster:thread-teaching-record -->",
        "Kind: approval",
        "Summary: Build is approved.",
        "Applies To: issue-triage.build",
      ].join("\n"),
      url: "https://example.com/1",
      created_at: "2026-04-20T01:00:00Z",
    },
  ], {
    appliesTo: ["issue-triage.build"],
    now: "2026-04-20T02:00:00Z",
  });

  assert.deepEqual(context?.gate_authorizations, [
    {
      selector: "issue-triage.build",
      decision: "allow",
      reason: "Build is approved.",
      record_id: "repo-thread-0-approval-2026-04-20t01-00-00z",
      kind: "approval",
      source_type: "issue_comment",
      source_url: "https://example.com/1",
      recorded_by: "kam",
      recorded_at: "2026-04-20T01:00:00Z",
    },
  ]);
});
