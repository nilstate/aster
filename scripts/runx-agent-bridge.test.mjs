import test from "node:test";
import assert from "node:assert/strict";

import {
  gateSelectorMatches,
  threadTeachingAllowsGate,
} from "./runx-agent-bridge.mjs";

test("gateSelectorMatches supports exact and wildcard gate selectors", () => {
  assert.equal(gateSelectorMatches("issue-triage.plan", "issue-triage.plan"), true);
  assert.equal(gateSelectorMatches("issue-triage.*", "issue-triage.plan"), true);
  assert.equal(gateSelectorMatches("issue-triage.*", "fix-pr.review"), false);
});

test("threadTeachingAllowsGate auto-approves only explicitly scoped gates", () => {
  const threadTeachingContext = {
    records: [
      {
        record_id: "record-1",
        kind: "approval",
        summary: "Planning and build are approved.",
        applies_to: ["issue-triage.plan", "fix-pr.review"],
        decisions: [
          {
            gate_id: "issue-triage.build",
            decision: "allow",
            reason: "build is explicitly approved",
          },
        ],
      },
    ],
  };

  assert.equal(threadTeachingAllowsGate(threadTeachingContext, { id: "issue-triage.plan" }), true);
  assert.equal(threadTeachingAllowsGate(threadTeachingContext, { id: "issue-triage.build" }), true);
  assert.equal(threadTeachingAllowsGate(threadTeachingContext, { id: "docs-pr.publish" }), false);
});
