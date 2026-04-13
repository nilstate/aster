import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const options = parseArgs(process.argv.slice(2));
const report = JSON.parse(await readFile(options.input, "utf8"));
const payload = JSON.parse(report.execution.stdout);
const skillName = payload.skill_spec?.name ?? slugify(options.title);
const slug = slugify(skillName);
const outputDir = path.resolve(options.outputDir ?? "docs/skill-proposals");
const markdownPath = path.join(outputDir, `${slug}.md`);
const jsonPath = path.join(outputDir, `${slug}.json`);

await mkdir(outputDir, { recursive: true });
await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
await writeFile(
  markdownPath,
  `${[
    "---",
    `title: ${payload.skill_spec?.name ?? options.title}`,
    `description: ${payload.skill_spec?.description ?? "Generated skill proposal."}`,
    "---",
    "",
    `# ${payload.skill_spec?.name ?? options.title}`,
    "",
    `Source issue: ${options.issueUrl}`,
    "",
    "## Objective",
    "",
    options.title,
    "",
    "## Skill Contract",
    "",
    `- name: \`${payload.skill_spec?.name ?? "unknown"}\``,
    `- description: ${payload.skill_spec?.description ?? "n/a"}`,
    "",
    "## Execution Plan",
    "",
    "```json",
    JSON.stringify(payload.execution_plan ?? {}, null, 2),
    "```",
    "",
    "## Harness Fixtures",
    "",
    "```json",
    JSON.stringify(payload.harness_fixture ?? [], null, 2),
    "```",
    "",
    "## Acceptance Checks",
    "",
    ...((payload.acceptance_checks ?? []).map((item) => `- ${item}`)),
    "",
    "## Raw Packet",
    "",
    `See [${path.basename(jsonPath)}](./${path.basename(jsonPath)}).`,
    "",
  ].join("\n")}\n`,
);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "written",
      markdown_path: markdownPath,
      json_path: jsonPath,
    },
    null,
    2,
  )}\n`,
);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input") {
      options.input = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--title") {
      options.title = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--issue-url") {
      options.issueUrl = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--output-dir") {
      options.outputDir = requireValue(argv, ++index, token);
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  if (!options.input || !options.title || !options.issueUrl) {
    throw new Error("--input, --title, and --issue-url are required.");
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

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
