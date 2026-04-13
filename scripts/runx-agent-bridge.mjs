import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runxRepoRoot = resolveRunxRepoRoot(options.runxRoot);
  const cliBin = path.join(runxRepoRoot, "packages", "cli", "dist", "index.js");
  const receiptDir = path.resolve(options.receiptDir ?? ".artifacts/runx-bridge");
  const traceDir = path.resolve(options.traceDir ?? path.join(receiptDir, "provider-trace"));
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "automaton-runx-bridge-"));
  const approvedGates = new Set([
    ...splitCsv(process.env.RUNX_APPROVED_GATES),
    ...options.approve,
  ]);
  const provider = options.provider ?? process.env.RUNX_CALLER_PROVIDER ?? "openai";
  const model = options.model ?? process.env.RUNX_CALLER_MODEL ?? "gpt-4o-2024-08-06";
  const maxTurns = Number(options.maxTurns ?? process.env.RUNX_CALLER_MAX_TURNS ?? "8");

  if (!existsSync(cliBin)) {
    throw new Error(`runx CLI build not found at ${cliBin}`);
  }
  if (options.runxArgs.length === 0) {
    throw new Error("No runx command was provided. Pass the runx invocation after --.");
  }

  await mkdir(receiptDir, { recursive: true });
  await mkdir(traceDir, { recursive: true });

  let runArgs = [...options.runxArgs];
  let latestStdout = "";
  let latestExitCode = 0;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const invocation = await runRunx({
      cliBin,
      receiptDir,
      runArgs,
      workdir: options.workdir,
    });

    latestStdout = invocation.stdout;
    latestExitCode = invocation.exitCode;

    if (!invocation.stdout.trim()) {
      throw new Error(invocation.stderr.trim() || "runx returned no JSON output.");
    }

    const report = JSON.parse(invocation.stdout);
    if (options.outputPath) {
      await writeFile(path.resolve(options.outputPath), JSON.stringify(report, null, 2));
    }

    if (report.status !== "needs_resolution") {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      process.exit(latestExitCode);
    }

    const answers = {};
    const approvals = {};

    for (const request of report.requests ?? []) {
      if (request.kind === "approval") {
        const gateId = String(request.gate?.id ?? "");
        if (options.approveAll || approvedGates.has(gateId)) {
          approvals[gateId] = true;
          continue;
        }
        throw new Error(`Unapproved gate '${gateId}' encountered. Add --approve ${gateId} or set RUNX_APPROVED_GATES.`);
      }

      if (request.kind === "cognitive_work") {
        answers[request.id] = await resolveCognitiveWork({
          provider,
          model,
          request,
          traceDir,
        });
        continue;
      }

      throw new Error(`Unsupported runx resolution request kind: ${request.kind}`);
    }

    const answersPath = path.join(tempDir, `answers-turn-${turn + 1}.json`);
    await writeFile(
      answersPath,
      `${JSON.stringify(compactAnswersPayload(answers, approvals), null, 2)}\n`,
    );
    runArgs = ["resume", String(report.run_id), "--answers", answersPath];
  }

  throw new Error(`runx bridge exceeded ${maxTurns} turns without reaching completion.`);
}

function parseArgs(argv) {
  const options = {
    approve: [],
    runxArgs: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      options.runxArgs = argv.slice(index + 1);
      break;
    }
    if (token === "--runx-root") {
      options.runxRoot = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--receipt-dir") {
      options.receiptDir = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--trace-dir") {
      options.traceDir = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--workdir") {
      options.workdir = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--output") {
      options.outputPath = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--model") {
      options.model = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--provider") {
      options.provider = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--max-turns") {
      options.maxTurns = requireValue(argv, ++index, token);
      continue;
    }
    if (token === "--approve") {
      options.approve.push(requireValue(argv, ++index, token));
      continue;
    }
    if (token === "--approve-all") {
      options.approveAll = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (!options.runxRoot) {
    throw new Error("--runx-root is required.");
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

function resolveRunxRepoRoot(runxRoot) {
  const directRoot = path.resolve(runxRoot);
  if (existsSync(path.join(directRoot, "packages", "cli", "dist", "index.js"))) {
    return directRoot;
  }
  const nestedRoot = path.join(directRoot, "oss");
  if (existsSync(path.join(nestedRoot, "packages", "cli", "dist", "index.js"))) {
    return nestedRoot;
  }
  throw new Error(
    `Unable to resolve runx repo root from ${runxRoot}. Expected packages/cli/dist/index.js or oss/packages/cli/dist/index.js.`,
  );
}

async function runRunx({ cliBin, receiptDir, runArgs, workdir }) {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [
        cliBin,
        ...runArgs,
        "--non-interactive",
        "--json",
        "--receipt-dir",
        receiptDir,
      ],
      {
        cwd: workdir ? path.resolve(workdir) : process.cwd(),
        env: process.env,
        maxBuffer: 50 * 1024 * 1024,
      },
    );
    return {
      exitCode: 0,
      stdout,
      stderr,
    };
  } catch (error) {
    return {
      exitCode: error.code ?? 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? error.message,
    };
  }
}

async function resolveCognitiveWork({ provider, model, request, traceDir }) {
  if (provider !== "openai") {
    throw new Error(`Unsupported provider '${provider}'.`);
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for runx cognitive work.");
  }

  const schema = buildResolutionSchema(request.work.envelope.expected_outputs ?? {});
  const requestId = sanitizeTraceName(request.id);
  const payload = {
    model,
    input: [
      {
        role: "system",
        content:
          "You are the external caller for a governed runx skill boundary. Return only one JSON object that matches the provided schema exactly. Ground every field in the provided inputs and context. Do not invent repository state, URLs, files, APIs, or evidence that are not present in the envelope. Keep outputs bounded and practical so the run can continue safely.",
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            request_id: request.id,
            source_type: request.work.source_type,
            agent: request.work.agent,
            task: request.work.task,
            envelope: request.work.envelope,
          },
          null,
          2,
        ),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "runx_resolution",
        schema,
        strict: true,
      },
    },
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Client-Request-Id": requestId.slice(0, 128),
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) : {};

  await writeFile(
    path.join(traceDir, `${requestId}.json`),
    `${JSON.stringify({ request: payload, response: parsed }, null, 2)}\n`,
  );

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${response.statusText}`);
  }

  const outputText = extractOutputText(parsed);
  if (!outputText) {
    throw new Error(`OpenAI response for ${request.id} did not include structured output text.`);
  }

  return JSON.parse(outputText);
}

function buildResolutionSchema(expectedOutputs) {
  const properties = {};
  const required = [];

  for (const [key, value] of Object.entries(expectedOutputs)) {
    properties[key] = schemaForDeclaredType(String(value));
    required.push(key);
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

function schemaForDeclaredType(type) {
  switch (type) {
    case "string":
      return { type: "string" };
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "array":
      return {
        type: "array",
        items: {
          anyOf: [
            { type: "object", additionalProperties: true },
            { type: "array", items: {} },
            { type: "string" },
            { type: "number" },
            { type: "boolean" },
            { type: "null" },
          ],
        },
      };
    case "json":
      return {
        anyOf: [
          { type: "object", additionalProperties: true },
          { type: "array", items: {} },
          { type: "string" },
          { type: "number" },
          { type: "boolean" },
          { type: "null" },
        ],
      };
    case "object":
    default:
      return {
        type: "object",
        additionalProperties: true,
      };
  }
}

function extractOutputText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  const outputItems = Array.isArray(response.output) ? response.output : [];
  for (const item of outputItems) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const block of content) {
      if (typeof block?.text === "string" && block.text.trim()) {
        return block.text;
      }
    }
  }
  return undefined;
}

function compactAnswersPayload(answers, approvals) {
  const payload = {};
  if (Object.keys(answers).length > 0) {
    payload.answers = answers;
  }
  if (Object.keys(approvals).length > 0) {
    payload.approvals = approvals;
  }
  return payload;
}

function splitCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function sanitizeTraceName(value) {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "_");
}

await main();
