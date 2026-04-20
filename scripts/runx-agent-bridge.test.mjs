import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLiveTraceState,
  gateSelectorMatches,
  inferTraceHeartbeatIntervalMs,
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

test("inferTraceHeartbeatIntervalMs stays bounded for hosted requests", () => {
  assert.equal(inferTraceHeartbeatIntervalMs(300000), 15000);
  assert.equal(inferTraceHeartbeatIntervalMs(12000), 5000);
  assert.equal(inferTraceHeartbeatIntervalMs(Number.NaN), 15000);
});

test("buildLiveTraceState renders a stable live trace snapshot", () => {
  const snapshot = buildLiveTraceState({
    requestId: "resolve-comment",
    attempt: 2,
    maxAttempts: 3,
    requestApi: "responses",
    status: "waiting",
    timeoutMs: 300000,
    startedAt: "2026-04-20T06:00:00.000Z",
    heartbeatAt: "2026-04-20T06:00:15.000Z",
    expectedOutputs: {
      comment_body: "string",
      should_post: "boolean",
    },
    note: "still waiting",
    responseStatus: null,
  });

  assert.equal(snapshot.kind, "aster.provider-trace-live.v1");
  assert.equal(snapshot.request_id, "resolve-comment");
  assert.equal(snapshot.attempt, 2);
  assert.equal(snapshot.max_attempts, 3);
  assert.equal(snapshot.request_api, "responses");
  assert.equal(snapshot.status, "waiting");
  assert.equal(snapshot.timeout_ms, 300000);
  assert.equal(snapshot.elapsed_ms, 15000);
  assert.deepEqual(snapshot.expected_output_keys, ["comment_body", "should_post"]);
  assert.equal(snapshot.note, "still waiting");
});
