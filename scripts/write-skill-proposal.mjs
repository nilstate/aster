import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const result = await materializeSkillProposal(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export async function materializeSkillProposal(options) {
  const report = JSON.parse(await readFile(options.input, "utf8"));
  const payload = extractSkillProposalPayload(report);
  const issuePacket = options.issuePacket
    ? JSON.parse(await readFile(path.resolve(options.issuePacket), "utf8"))
    : null;
  const skillName = payload.skill_spec?.name ?? slugify(options.title);
  const slug = slugify(skillName);
  const outputDir = path.resolve(options.outputDir ?? "docs/skill-proposals");
  const markdownPath = path.join(outputDir, `${slug}.md`);
  const jsonPath = path.join(outputDir, `${slug}.json`);

  await mkdir(outputDir, { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(
    markdownPath,
    `${buildSkillProposalMarkdown({
      payload,
      title: options.title,
      issueUrl: issuePacket?.source_issue?.url ?? options.issueUrl,
      issuePacket,
      jsonPath,
    })}\n`,
  );

  return {
    status: "written",
    markdown_path: markdownPath,
    json_path: jsonPath,
  };
}

export function buildSkillProposalMarkdown({ payload, title, issueUrl, issuePacket, jsonPath }) {
  const proposalTitle = firstNonEmptyString(payload.skill_spec?.name, payload.skill_spec?.skill_name, title);
  const proposalDescription =
    payload.skill_spec?.description
    ?? payload.skill_spec?.summary
    ?? "Generated skill proposal.";
  const acceptanceChecks = formatAcceptanceChecks(payload.acceptance_checks);
  const effectiveObjective =
    firstNonEmptyString(payload.skill_spec?.objective, payload.skill_spec?.summary, title)
    ?? "Generated skill proposal objective not supplied.";

  const sourceSections = issuePacket?.sections ?? {};
  const maintainerAmendments = Array.isArray(issuePacket?.amendments) ? issuePacket.amendments : [];
  const findings = Array.isArray(payload.findings) ? payload.findings : [];
  const recommendedFlow = Array.isArray(payload.recommended_flow) ? payload.recommended_flow : [];
  const sources = Array.isArray(payload.sources) ? payload.sources : [];
  const risks = Array.isArray(payload.risks) ? payload.risks : [];
  const workIssueRepo = firstNonEmptyString(issuePacket?.source_issue?.repo);
  const workIssueNumber = normalizeWorkIssueNumber(issuePacket?.source_issue?.number);
  const workIssueRef = workIssueRepo && workIssueNumber
    ? `${workIssueRepo}#${workIssueNumber}`
    : null;
  const ledgerRevision = firstNonEmptyString(issuePacket?.source_issue?.ledger_revision);
  const lines = [
    "---",
    `title: ${yamlString(proposalTitle)}`,
    `description: ${yamlString(proposalDescription)}`,
    "---",
    "",
    `# ${proposalTitle}`,
    "",
    "## Work Ledger",
    "",
    workIssueRef ? `- Work issue: \`${workIssueRef}\`` : null,
    `- Work issue URL: ${issueUrl ?? "n/a"}`,
    ledgerRevision ? `- Ledger revision: \`${ledgerRevision}\`` : null,
    "- Maintainer amendments stay on the same work issue thread.",
    "- Draft PR refresh requires `skill-lab.publish` authorization on the same work issue.",
    "",
  ];

  if (maintainerAmendments.length > 0) {
    lines.push(
      "## Maintainer Amendments",
      "",
      "Later maintainer amendments on the living ledger take precedence over stale original wording when they conflict.",
      "",
      ...formatMaintainerAmendments(maintainerAmendments),
      "",
    );
  }

  lines.push(
    "## Objective",
    "",
    effectiveObjective,
    "",
  );

  if (
    sourceSections.objective &&
    normalizeComparableText(sourceSections.objective) !== normalizeComparableText(effectiveObjective)
  ) {
    lines.push("## Original Request", "", sourceSections.objective, "");
  }

  if (sourceSections.why_it_matters) {
    lines.push("## Why It Matters", "", sourceSections.why_it_matters, "");
  }
  if (sourceSections.constraints) {
    lines.push("## Constraints", "", sourceSections.constraints, "");
  }
  if (sourceSections.evidence) {
    lines.push("## Evidence", "", sourceSections.evidence, "");
  }
  if (sourceSections.additional_notes) {
    lines.push("## Additional Notes", "", sourceSections.additional_notes, "");
  }

  lines.push(
    "## Skill Contract",
    "",
    `- name: \`${firstNonEmptyString(payload.skill_spec?.name, payload.skill_spec?.skill_name) ?? "unknown"}\``,
    payload.skill_spec?.kind ? `- kind: \`${payload.skill_spec.kind}\`` : null,
    payload.skill_spec?.status ? `- status: \`${payload.skill_spec.status}\`` : null,
    `- description: ${payload.skill_spec?.description ?? payload.skill_spec?.summary ?? "n/a"}`,
    payload.skill_spec?.summary ? `- summary: ${payload.skill_spec.summary}` : null,
    payload.skill_spec?.objective ? `- objective: ${payload.skill_spec.objective}` : null,
    Array.isArray(payload.skill_spec?.composes_with) && payload.skill_spec.composes_with.length > 0
      ? `- composes_with: ${payload.skill_spec.composes_with.map((value) => `\`${value}\``).join(", ")}`
      : null,
    "",
    ...formatNamedObjectSection("Governance", payload.skill_spec?.governance),
    ...formatBulletSection("Invariants", payload.skill_spec?.invariants),
    ...formatFieldSchemaSection("Inputs", payload.skill_spec?.inputs),
    ...formatFieldSchemaSection("Outputs", payload.skill_spec?.outputs),
    ...formatFlexibleSection("Pain Points", payload.pain_points),
    ...formatFlexibleSection("Catalog Fit", payload.catalog_fit),
    ...formatFlexibleSection("Maintainer Decisions", payload.maintainer_decisions),
    ...formatFindingsSection(findings),
    ...formatRecommendedFlowSection(recommendedFlow),
    ...formatSourcesSection(sources),
    ...formatRisksSection(risks),
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
    ...acceptanceChecks,
    "",
    "## Raw Packet",
    "",
    `See [${path.basename(jsonPath)}](./${path.basename(jsonPath)}).`,
    "",
  );

  return lines.join("\n");
}

export function extractSkillProposalPayload(report) {
  if (isSkillProposalPayload(report)) {
    return report;
  }

  const stdout = firstNonEmptyString(report?.execution?.stdout);
  const parsed = tryParseJson(stdout);
  if (isSkillProposalPayload(parsed)) {
    return parsed;
  }

  throw new Error("Skill proposal payload not found in run result.");
}

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
    if (token === "--issue-packet") {
      options.issuePacket = requireValue(argv, ++index, token);
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

function yamlString(value) {
  return JSON.stringify(String(value));
}

function formatAcceptanceChecks(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return ["- none supplied"];
  }
  return value.map((item) => {
    if (typeof item === "string") {
      return `- ${item}`;
    }
    if (item && typeof item === "object") {
      const id = typeof item.id === "string" ? `\`${item.id}\`` : null;
      const summary = firstNonEmptyString(item.assertion, item.summary, item.question);
      if (id && summary) {
        return `- ${id}: ${summary}`;
      }
      if (summary) {
        return `- ${summary}`;
      }
      return `- ${JSON.stringify(item)}`;
    }
    return `- ${String(item)}`;
  });
}

function formatFieldSchemaSection(title, value) {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  const lines = [title ? `## ${title}` : "", ""];
  for (const field of value) {
    if (!field || typeof field !== "object") {
      lines.push(`- ${String(field)}`);
      continue;
    }
    const name = firstNonEmptyString(field.name) ?? "unknown";
    const type = firstNonEmptyString(field.type);
    const required = typeof field.required === "boolean" ? field.required : null;
    const description = firstNonEmptyString(field.description);
    const parts = [`\`${name}\``];
    if (type) {
      parts.push(`type=\`${type}\``);
    }
    if (required !== null) {
      parts.push(required ? "required" : "optional");
    }
    if (description) {
      parts.push(description);
    }
    lines.push(`- ${parts.join(" · ")}`);
  }
  lines.push("");
  return lines;
}

function formatNamedObjectSection(title, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const lines = [`## ${title}`, ""];
  for (const [key, raw] of Object.entries(value)) {
    const rendered = formatInlineValue(raw);
    lines.push(`- ${key}: ${rendered}`);
  }
  lines.push("");
  return lines;
}

function formatBulletSection(title, value) {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  return [
    `## ${title}`,
    "",
    ...value.map((entry) => `- ${formatInlineValue(entry)}`),
    "",
  ];
}

function formatFlexibleSection(title, value) {
  if (value == null) {
    return [];
  }
  if (typeof value === "string") {
    return [`## ${title}`, "", value, ""];
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [];
    }
    const lines = [`## ${title}`, ""];
    for (const item of value) {
      if (typeof item === "string") {
        lines.push(`- ${item}`);
        continue;
      }
      if (item && typeof item === "object") {
        const summary = firstNonEmptyString(
          item.summary,
          item.problem,
          item.question,
          item.title,
          item.name,
        );
        if (summary) {
          lines.push(`- ${summary}`);
        } else {
          lines.push(`- ${JSON.stringify(item)}`);
        }
        const details = [
          firstNonEmptyString(item.why),
          firstNonEmptyString(item.relevance),
          firstNonEmptyString(item.rationale),
        ].filter(Boolean);
        if (details.length > 0) {
          lines.push(`  ${details.join(" · ")}`);
        }
        const options = Array.isArray(item.options) ? item.options.filter(Boolean) : [];
        if (options.length > 0) {
          lines.push(`  options: ${options.join(" | ")}`);
        }
        continue;
      }
      lines.push(`- ${String(item)}`);
    }
    lines.push("");
    return lines;
  }
  if (typeof value === "object") {
    return formatNamedObjectSection(title, value);
  }
  return [`## ${title}`, "", String(value), ""];
}

function formatFindingsSection(findings) {
  if (findings.length === 0) {
    return [];
  }

  const lines = ["## Findings", ""];
  for (const finding of findings) {
    if (!finding || typeof finding !== "object") {
      lines.push(`- ${String(finding)}`);
      continue;
    }
    const claim = firstNonEmptyString(finding.claim) ?? JSON.stringify(finding);
    lines.push(`- ${claim}`);
    const source = firstNonEmptyString(finding.source);
    if (source) {
      lines.push(`  source: ${source}`);
    }
    const relevance = firstNonEmptyString(finding.relevance);
    if (relevance) {
      lines.push(`  relevance: ${relevance}`);
    }
    const confidence = firstNonEmptyString(finding.confidence);
    if (confidence) {
      lines.push(`  confidence: ${confidence}`);
    }
  }
  lines.push("");
  return lines;
}

function formatRecommendedFlowSection(flow) {
  if (flow.length === 0) {
    return [];
  }

  const lines = ["## Recommended Flow", ""];
  for (const item of flow) {
    if (!item || typeof item !== "object") {
      lines.push(`- ${String(item)}`);
      continue;
    }
    const step = firstNonEmptyString(item.step) ?? JSON.stringify(item);
    lines.push(`- ${step}`);
    const details = firstNonEmptyString(item.details, item.basis);
    if (details) {
      lines.push(`  ${details}`);
    }
  }
  lines.push("");
  return lines;
}

function formatSourcesSection(sources) {
  if (sources.length === 0) {
    return [];
  }

  const lines = ["## Sources", ""];
  for (const source of sources) {
    if (!source || typeof source !== "object") {
      lines.push(`- ${String(source)}`);
      continue;
    }
    const title = firstNonEmptyString(source.title, source.reference) ?? JSON.stringify(source);
    const locator = firstNonEmptyString(source.locator);
    const details = firstNonEmptyString(source.notes, source.details);
    const parts = [title];
    if (locator) {
      parts.push(locator);
    }
    lines.push(`- ${parts.join(" — ")}`);
    if (details) {
      lines.push(`  ${details}`);
    }
  }
  lines.push("");
  return lines;
}

function formatRisksSection(risks) {
  if (risks.length === 0) {
    return [];
  }

  const lines = ["## Risks", ""];
  for (const risk of risks) {
    if (!risk || typeof risk !== "object") {
      lines.push(`- ${String(risk)}`);
      continue;
    }
    const summary = firstNonEmptyString(risk.risk) ?? JSON.stringify(risk);
    lines.push(`- ${summary}`);
    const meta = [
      firstNonEmptyString(risk.likelihood) ? `likelihood=${risk.likelihood}` : null,
      firstNonEmptyString(risk.impact) ? `impact=${risk.impact}` : null,
    ].filter(Boolean);
    if (meta.length > 0) {
      lines.push(`  ${meta.join(" · ")}`);
    }
    const mitigation = firstNonEmptyString(risk.mitigation);
    if (mitigation) {
      lines.push(`  mitigation: ${mitigation}`);
    }
  }
  lines.push("");
  return lines;
}

function formatMaintainerAmendments(amendments) {
  return [...amendments]
    .reverse()
    .flatMap((amendment, index) => {
      const header = [
        `### Amendment ${index + 1}`,
        "",
        amendment.recorded_at ? `- recorded_at: ${amendment.recorded_at}` : null,
        amendment.author ? `- author: ${amendment.author}` : null,
        amendment.url ? `- url: ${amendment.url}` : null,
        amendment.thread_teaching_record
          ? `- structured_teaching: ${amendment.thread_teaching_record.kind} — ${amendment.thread_teaching_record.summary}`
          : null,
        "",
      ].filter(Boolean);
      const body = amendment.thread_teaching_record
        ? formatThreadTeachingRecord(amendment.thread_teaching_record)
        : firstNonEmptyString(amendment.body);
      return body ? [...header, body, ""] : header;
    });
}

function formatThreadTeachingRecord(record) {
  const lines = [];
  const appliesTo = Array.isArray(record?.applies_to) ? record.applies_to.filter(Boolean) : [];
  const decisions = Array.isArray(record?.decisions) ? record.decisions : [];
  if (appliesTo.length > 0) {
    lines.push(`Applies to: ${appliesTo.join(", ")}`);
  }
  if (decisions.length > 0) {
    lines.push("Decisions:");
    for (const decision of decisions) {
      if (!decision || typeof decision !== "object") {
        continue;
      }
      const gateId = firstNonEmptyString(decision.gate_id) ?? "unknown";
      const outcome = firstNonEmptyString(decision.decision) ?? "unknown";
      const reason = firstNonEmptyString(decision.reason);
      lines.push(`- ${gateId} = ${outcome}${reason ? ` | ${reason}` : ""}`);
    }
  }
  return lines.join("\n");
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function normalizeComparableText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWorkIssueNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

function tryParseJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function isSkillProposalPayload(value) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && (
      value.skill_spec
      || value.execution_plan
      || value.harness_fixture
      || value.acceptance_checks
    ),
  );
}

function formatInlineValue(value) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => formatInlineValue(entry)).join(", ");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return "n/a";
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
