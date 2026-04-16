import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildContextBundle,
  renderContextPrompt,
  slugifyRepoLike,
} from "./build-maton-context.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("slugifyRepoLike normalizes repo locators", () => {
  assert.equal(slugifyRepoLike("nilstate/maton"), "nilstate-maton");
});

test("buildContextBundle loads doctrine, state, and target dossier", async () => {
  const bundle = await buildContextBundle({
    repoRoot,
    lane: "issue-triage",
    subjectKind: "github_issue",
    subjectLocator: "nilstate/maton#issue/42",
    repo: "nilstate/maton",
    targetRepo: "nilstate/maton",
  });

  assert.equal(bundle.lane, "issue-triage");
  assert.equal(bundle.subject.kind, "github_issue");
  assert.equal(bundle.state.target?.title, "Target Dossier — nilstate/maton");
  assert.ok(bundle.state.target_summary?.default_lanes.includes("issue-triage"));
  assert.ok(bundle.state.target_summary?.current_opportunities.length >= 1);
  assert.ok(bundle.doctrine.some((doc) => doc.title === "Maton Thesis"));
  assert.ok(bundle.history.length >= 1);
  assert.ok(bundle.reflections.length >= 1);
});

test("renderContextPrompt includes doctrine and state sections", async () => {
  const bundle = await buildContextBundle({
    repoRoot,
    lane: "issue-triage",
    subjectKind: "github_pull_request",
    subjectLocator: "nilstate/maton#pr/7",
    repo: "nilstate/maton",
    targetRepo: "nilstate/runx",
  });

  const prompt = renderContextPrompt(bundle);
  assert.match(prompt, /# Maton Context Bundle/);
  assert.match(prompt, /## Doctrine/);
  assert.match(prompt, /## Current State/);
  assert.match(prompt, /### Target Summary/);
  assert.match(prompt, /Target Dossier/);
});
