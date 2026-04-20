import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { classifyIssueEnvelope } from "./classify-issue-envelope.mjs";

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const issue = JSON.parse(await readFile(path.resolve(options.input), "utf8"));
  const packet = buildCollaborationRecordPacket({
    issue,
    repo: options.repo,
    now: options.now,
  });
  if (options.output) {
    await writeFile(path.resolve(options.output), `${JSON.stringify(packet, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
}

export function buildCollaborationRecordPacket({ issue = {}, repo, now } = {}) {
  const classification = classifyIssueEnvelope(issue);
  const validation = validateCollaborationRecord(classification.record);
  const generatedAt = now ?? new Date().toISOString();
  const resolvedReason =
    classification.mode === "thread_teaching_record" && !validation.valid
      ? validation.reason
      : classification.reason;
  const accepted = classification.mode === "thread_teaching_record" && validation.valid;

  return {
    kind: "aster.collaboration-record.v1",
    generated_at: generatedAt,
    repo: normalizeString(repo),
    issue: {
      number: normalizeNumber(issue.number),
      title: normalizeString(issue.title),
      url: normalizeString(issue.url),
      source_locator:
        normalizeString(repo) && normalizeNumber(issue.number) !== null
          ? `${normalizeString(repo)}#issue/${normalizeNumber(issue.number)}`
          : null,
    },
    status: accepted ? "accepted" : "held",
    classification: {
      mode: classification.mode,
      reason: resolvedReason,
    },
    validation,
    record: classification.record ?? null,
    projection_actions: {
      refresh_thread_teaching: accepted,
      dispatch_workflow: accepted ? "thread-teaching-derive" : null,
    },
    evidence_refs: [
      ...(normalizeString(issue.url)
        ? [
            {
              type: "github_issue",
              uri: normalizeString(issue.url),
            },
          ]
        : []),
    ],
  };
}

export function validateCollaborationRecord(record) {
  if (!record) {
    return {
      valid: false,
      reason: "missing_thread_teaching_record",
    };
  }
  if (!normalizeString(record.target_repo)) {
    return {
      valid: false,
      reason: "collaboration_record_missing_target_repo",
    };
  }
  if (!normalizeString(record.subject_locator)) {
    return {
      valid: false,
      reason: "collaboration_record_missing_subject_locator",
    };
  }
  if (
    ["approval", "publish_authorization"].includes(String(record.kind ?? "").trim())
    && normalizeStringArray(record.applies_to).length === 0
    && normalizeDecisionArray(record.decisions).length === 0
  ) {
    return {
      valid: false,
      reason: "gate_record_missing_gate_scope",
    };
  }
  return {
    valid: true,
    reason: "valid",
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input") {
      options.input = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--repo") {
      options.repo = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--now") {
      options.now = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--output") {
      options.output = requireValue(argv, ++index, token);
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  if (!options.input) {
    throw new Error("--input is required.");
  }
  if (!options.repo) {
    throw new Error("--repo is required.");
  }
  return options;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function normalizeString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeStringArray(values) {
  return Array.isArray(values)
    ? values.filter((value) => typeof value === "string" && value.trim().length > 0).map((value) => value.trim())
    : [];
}

function normalizeDecisionArray(values) {
  return Array.isArray(values)
    ? values.filter((value) => value && typeof value === "object" && typeof value.gate_id === "string" && value.gate_id.trim().length > 0)
    : [];
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
