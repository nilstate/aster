import test from "node:test";
import assert from "node:assert/strict";

import { buildCollaborationRecordPacket, validateCollaborationRecord } from "./build-collaboration-record-packet.mjs";
import { THREAD_TEACHING_MARKER } from "./thread-teaching.mjs";

test("validateCollaborationRecord accepts a bounded publish authorization record", () => {
  const result = validateCollaborationRecord({
    kind: "publish_authorization",
    target_repo: "nilstate/aster",
    subject_locator: "nilstate/aster",
    applies_to: ["docs-pr.publish"],
    decisions: [],
  });

  assert.deepEqual(result, {
    valid: true,
    reason: "valid",
  });
});

test("buildCollaborationRecordPacket accepts a canonical collaboration record", () => {
  const packet = buildCollaborationRecordPacket({
    repo: "nilstate/aster",
    now: "2026-04-20T05:00:00Z",
    issue: {
      number: 54,
      title: "[collaboration] approve docs publish gate",
      url: "https://github.com/nilstate/aster/issues/54",
      body: [
        THREAD_TEACHING_MARKER,
        "Kind: publish_authorization",
        "Summary: One bounded docs PR may be published.",
        "Recorded By: kam",
        "Target Repo: nilstate/aster",
        "Subject Locator: nilstate/aster",
        "Applies To: docs-pr.publish",
        "Decision: docs-pr.publish = allow | bounded publication is approved",
      ].join("\n"),
    },
  });

  assert.equal(packet.status, "accepted");
  assert.equal(packet.classification.mode, "thread_teaching_record");
  assert.equal(packet.validation.valid, true);
  assert.equal(packet.projection_actions.refresh_thread_teaching, true);
  assert.equal(packet.record?.kind, "publish_authorization");
});

test("buildCollaborationRecordPacket holds malformed collaboration records", () => {
  const packet = buildCollaborationRecordPacket({
    repo: "nilstate/aster",
    issue: {
      number: 55,
      title: "[collaboration] malformed",
      url: "https://github.com/nilstate/aster/issues/55",
      body: "Missing the canonical marker.",
    },
  });

  assert.equal(packet.status, "held");
  assert.equal(packet.classification.reason, "collaboration_title_requires_thread_teaching_record");
  assert.equal(packet.projection_actions.refresh_thread_teaching, false);
});

test("buildCollaborationRecordPacket holds records missing target scope", () => {
  const packet = buildCollaborationRecordPacket({
    repo: "nilstate/aster",
    issue: {
      number: 56,
      title: "[collaboration] missing target repo",
      url: "https://github.com/nilstate/aster/issues/56",
      body: [
        THREAD_TEACHING_MARKER,
        "Kind: lesson",
        "Summary: Keep explanations bounded.",
        "Recorded By: kam",
        "Subject Locator: nilstate/aster",
      ].join("\n"),
    },
  });

  assert.equal(packet.status, "held");
  assert.equal(packet.classification.mode, "thread_teaching_record");
  assert.equal(packet.classification.reason, "collaboration_record_missing_target_repo");
});
