import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const options = parseArgs(process.argv.slice(2));
const body = (await readFile(options.bodyFile, "utf8")).trim();
const comments = JSON.parse(
  execFileSync(
    "gh",
    [
      "pr",
      "view",
      options.pr,
      "--repo",
      options.repo,
      "--json",
      "comments",
    ],
    {
      encoding: "utf8",
    },
  ),
);

const marker = "<!-- automaton:runx-pr-triage -->";
const shaMarker = `Head SHA: ${options.sha}`;
const existing = (comments.comments ?? []).find(
  (comment) =>
    typeof comment.body === "string" &&
    comment.body.includes(marker) &&
    comment.body.includes(shaMarker),
);

if (existing) {
  process.stdout.write(
    `${JSON.stringify({ status: "noop", reason: "comment already exists" }, null, 2)}\n`,
  );
  process.exit(0);
}

const commentBody = `${body}\n\n${shaMarker}`;
execFileSync(
  "gh",
  [
    "pr",
    "comment",
    options.pr,
    "--repo",
    options.repo,
    "--body",
    commentBody,
  ],
  {
    stdio: "inherit",
  },
);

process.stdout.write(
  `${JSON.stringify({ status: "posted", sha: options.sha }, null, 2)}\n`,
);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--repo") {
      options.repo = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--pr") {
      options.pr = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--body-file") {
      options.bodyFile = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--sha") {
      options.sha = requireValue(argv, ++index, token);
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  if (!options.repo || !options.pr || !options.bodyFile || !options.sha) {
    throw new Error("--repo, --pr, --body-file, and --sha are required.");
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
