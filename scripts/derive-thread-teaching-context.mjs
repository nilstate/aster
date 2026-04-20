import { writeFile } from "node:fs/promises";
import path from "node:path";

import {
  deriveThreadTeachingContext,
  loadIssueThreadEntries,
  loadPullRequestThreadEntries,
} from "./thread-teaching.mjs";

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const entries = options.mode === "issue"
    ? loadIssueThreadEntries(options)
    : loadPullRequestThreadEntries(options);
  const context = deriveThreadTeachingContext(entries, {
    repo: options.repo,
    threadKind: options.mode,
    threadNumber: options.mode === "issue" ? options.issue : options.pr,
    recordKinds: options.recordKinds,
    targetRepo: options.targetRepo,
    subjectLocator: options.subjectLocator,
    objectiveFingerprint: options.objectiveFingerprint,
    appliesTo: options.appliesTo,
    labels: options.labels,
    now: options.now,
  });
  const output = context ?? {};
  if (options.output) {
    await writeFile(path.resolve(options.output), `${JSON.stringify(output, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function parseArgs(argv) {
  const options = {
    recordKinds: [],
    appliesTo: [],
    labels: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--mode") {
      options.mode = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--repo") {
      options.repo = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--issue") {
      options.issue = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--pr") {
      options.pr = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--record-kind") {
      options.recordKinds.push(requireValue(argv, ++index, token));
      continue;
    }
    if (token === "--target-repo") {
      options.targetRepo = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--subject-locator") {
      options.subjectLocator = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--objective-fingerprint") {
      options.objectiveFingerprint = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--applies-to") {
      options.appliesTo.push(requireValue(argv, ++index, token));
      continue;
    }
    if (token === "--label") {
      options.labels.push(requireValue(argv, ++index, token));
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
  if (!options.mode || !["issue", "pr"].includes(options.mode)) {
    throw new Error("--mode must be `issue` or `pr`.");
  }
  if (!options.repo) {
    throw new Error("--repo is required.");
  }
  if (options.mode === "issue" && !options.issue) {
    throw new Error("--issue is required for issue mode.");
  }
  if (options.mode === "pr" && !options.pr) {
    throw new Error("--pr is required for pr mode.");
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

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
