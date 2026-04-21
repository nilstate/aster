import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const latestBatch = JSON.parse(readFileSync(path.resolve(options.latestBatch), "utf8"));
  const changeSummary = summarizeWorkingTreeChanges(path.resolve(options.repoRoot));
  const decision = evaluateEvidenceProjectionPublication({
    latestBatch,
    changeSummary,
  });

  if (options.output) {
    await writeFile(path.resolve(options.output), `${JSON.stringify(decision, null, 2)}\n`);
  }

  process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
}

export function evaluateEvidenceProjectionPublication({ latestBatch, changeSummary }) {
  const noPublicProjectionDelta = Number(latestBatch?.applied_summaries ?? 0) === 0
    && Number(latestBatch?.suppressed_summaries ?? 0) === 0
    && Number(latestBatch?.public_projection_groups ?? 0) === 0
    && Number(latestBatch?.error_count ?? 0) === 0;
  const onlyEvidenceStateChanged = Number(changeSummary?.file_count ?? 0) === 1
    && Array.isArray(changeSummary?.files)
    && changeSummary.files[0] === "state/evidence-projections.json";

  if (noPublicProjectionDelta && onlyEvidenceStateChanged) {
    return {
      status: "noop",
      reason: "state_only_projection_compaction",
      change_summary: changeSummary,
      latest_batch: latestBatch,
    };
  }

  return {
    status: "publish",
    reason: "publication_required",
    change_summary: changeSummary,
    latest_batch: latestBatch,
  };
}

function summarizeWorkingTreeChanges(repoRoot) {
  const report = execFileSync("git", ["diff", "--numstat"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();

  if (!report) {
    return {
      file_count: 0,
      additions: 0,
      deletions: 0,
      files: [],
    };
  }

  const files = [];
  let additions = 0;
  let deletions = 0;
  for (const line of report.split("\n")) {
    const [added, removed, file] = line.split("\t");
    additions += Number(added) || 0;
    deletions += Number(removed) || 0;
    if (file) {
      files.push(file);
    }
  }

  return {
    file_count: files.length,
    additions,
    deletions,
    files,
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--repo-root") {
      options.repoRoot = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--latest-batch") {
      options.latestBatch = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--output") {
      options.output = requireValue(argv, ++index, token);
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (!options.repoRoot || !options.latestBatch) {
    throw new Error("--repo-root and --latest-batch are required.");
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
