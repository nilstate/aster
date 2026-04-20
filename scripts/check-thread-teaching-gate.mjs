import { writeFile } from "node:fs/promises";
import path from "node:path";

import {
  deriveThreadTeachingContext,
  threadTeachingContextAllowsGate,
  loadIssueThreadEntries,
  loadPullRequestThreadEntries,
} from "./thread-teaching.mjs";

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = await checkThreadTeachingGate(options);
  if (options.output) {
    await writeFile(path.resolve(options.output), `${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export async function checkThreadTeachingGate(options = {}) {
  const entries = options.mode === "pr"
    ? loadPullRequestThreadEntries({
        repo: options.repo,
        pr: options.pr,
      })
    : loadIssueThreadEntries({
        repo: options.repo,
        issue: options.issue,
      });

  const context = deriveThreadTeachingContext(entries, {
    repo: options.repo,
    threadKind: options.mode,
    threadNumber: options.mode === "pr" ? options.pr : options.issue,
    recordKinds: options.recordKinds,
    targetRepo: options.targetRepo,
    subjectLocator: options.subjectLocator,
    objectiveFingerprint: options.objectiveFingerprint,
    appliesTo: options.appliesTo,
    labels: options.labels,
    now: options.now,
  });

  const selectors = options.appliesTo;
  const missingSelectors = selectors.filter((selector) => !threadTeachingContextAllowsGate(context, selector));
  return {
    allowed: missingSelectors.length === 0 && Boolean(context),
    repo: options.repo,
    mode: options.mode,
    issue: options.issue ?? null,
    pr: options.pr ?? null,
    selectors,
    missing_selectors: missingSelectors,
    context: context ?? {},
  };
}

function parseArgs(argv) {
  const options = {
    mode: "issue",
    recordKinds: ["approval", "publish_authorization"],
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
  if (!options.repo) {
    throw new Error("--repo is required.");
  }
  if (options.mode === "issue" && !options.issue) {
    throw new Error("--issue is required for issue mode.");
  }
  if (options.mode === "pr" && !options.pr) {
    throw new Error("--pr is required for pr mode.");
  }
  if (options.appliesTo.length === 0) {
    throw new Error("--applies-to is required at least once.");
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
