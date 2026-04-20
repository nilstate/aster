import test from "node:test";
import assert from "node:assert/strict";

import { THREAD_TEACHING_MARKER } from "./thread-teaching.mjs";
import { classifyIssueEnvelope } from "./classify-issue-envelope.mjs";

test("classifyIssueEnvelope keeps standard issues on the triage path", () => {
  const result = classifyIssueEnvelope({
    title: "docs: tighten operations copy",
    body: "Please clarify the docs-pr gate flow.",
  });

  assert.deepEqual(result, {
    mode: "triage",
    reason: "standard_issue",
    record: null,
  });
});

test("classifyIssueEnvelope recognizes canonical thread-teaching records", () => {
  const result = classifyIssueEnvelope({
    title: "[collaboration] approve docs publish gate",
    body: [
      THREAD_TEACHING_MARKER,
      "Kind: publish_authorization",
      "Summary: One bounded docs PR is approved.",
      "Recorded By: kam",
      "Target Repo: nilstate/aster",
      "Subject Locator: nilstate/aster",
      "Applies To: docs-pr.publish",
      "Decision: docs-pr.publish = allow | bounded publication is approved",
    ].join("\n"),
  });

  assert.equal(result.mode, "thread_teaching_record");
  assert.equal(result.reason, "thread_teaching_record");
  assert.equal(result.record?.kind, "publish_authorization");
  assert.deepEqual(result.record?.applies_to, ["docs-pr.publish"]);
});

test("classifyIssueEnvelope blocks malformed collaboration issues from triage", () => {
  const result = classifyIssueEnvelope({
    title: "[collaboration] malformed record",
    body: "Missing the canonical thread-teaching marker.",
  });

  assert.deepEqual(result, {
    mode: "invalid_thread_teaching_record",
    reason: "collaboration_title_requires_thread_teaching_record",
    record: null,
  });
});

test("classifyIssueEnvelope blocks malformed thread-teaching bodies from triage", () => {
  const result = classifyIssueEnvelope({
    title: "Approval issue",
    body: [
      THREAD_TEACHING_MARKER,
      "Kind: publish_authorization",
      "Recorded By: kam",
    ].join("\n"),
  });

  assert.deepEqual(result, {
    mode: "invalid_thread_teaching_record",
    reason: "malformed_thread_teaching_record",
    record: null,
  });
});
