import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  THREAD_TEACHING_MARKER,
  parseThreadTeachingRecordBody,
} from "./thread-teaching.mjs";

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const issue = JSON.parse(await readFile(path.resolve(options.input), "utf8"));
  const result = classifyIssueEnvelope(issue);
  if (options.output) {
    await writeFile(path.resolve(options.output), `${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export function classifyIssueEnvelope(issue = {}) {
  const title = normalizeString(issue.title) ?? "";
  const body = typeof issue.body === "string" ? issue.body : "";
  const hasThreadTeachingMarker = body.includes(THREAD_TEACHING_MARKER);
  const hasCollaborationPrefix = /^\[collaboration\]/i.test(title);

  if (hasThreadTeachingMarker) {
    const record = parseThreadTeachingRecordBody(body);
    if (record) {
      return {
        mode: "thread_teaching_record",
        reason: "thread_teaching_record",
        record,
      };
    }
    return {
      mode: "invalid_thread_teaching_record",
      reason: "malformed_thread_teaching_record",
      record: null,
    };
  }

  if (hasCollaborationPrefix) {
    return {
      mode: "invalid_thread_teaching_record",
      reason: "collaboration_title_requires_thread_teaching_record",
      record: null,
    };
  }

  return {
    mode: "triage",
    reason: "standard_issue",
    record: null,
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
    if (token === "--output") {
      options.output = requireValue(argv, ++index, token);
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  if (!options.input) {
    throw new Error("--input is required.");
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

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
