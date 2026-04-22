import test from "node:test";
import assert from "node:assert/strict";

import { evaluateSkillProposalQuality } from "./evaluate-skill-proposal-quality.mjs";

test("evaluateSkillProposalQuality passes a crisp first-party proposal", () => {
  const evaluation = evaluateSkillProposalQuality({
    report: {
      execution: {
        stdout: JSON.stringify({
          skill_spec: {
            skill_name: "decision-brief",
            summary: "Read one living work ledger and return one bounded maintainer decision packet.",
          },
          pain_points: [
            "Maintainers need a compact next-step packet instead of re-reading the whole work thread.",
          ],
          catalog_fit: {
            adjacent_skills: ["issue-triage", "skill-lab"],
            why_new: "The current catalog does not have a narrow single-packet decision skill.",
          },
          maintainer_decisions: [
            {
              question: "Should the first version stop at review?",
            },
          ],
          acceptance_checks: [{ id: "ac-1" }, { id: "ac-2" }, { id: "ac-3" }],
          harness_fixture: [
            {
              target: "../decision-brief",
            },
          ],
        }),
      },
    },
    catalogEntries: ["issue-triage", "skill-lab", "issue-to-pr"],
  });

  assert.equal(evaluation.status, "pass");
  assert.equal(evaluation.checks.proposal_named, true);
  assert.equal(evaluation.checks.pain_points_explicit, true);
  assert.equal(evaluation.checks.catalog_overlap_explained, true);
  assert.equal(evaluation.findings.length, 0);
});

test("evaluateSkillProposalQuality ignores natural-language placeholder mentions", () => {
  const evaluation = evaluateSkillProposalQuality({
    report: {
      execution: {
        stdout: JSON.stringify({
          skill_spec: {
            skill_name: "decision-brief",
            summary: "Return one decision packet from one living ledger.",
          },
          pain_points: ["Maintainers need one next-step packet."],
          catalog_fit: {
            adjacent_skills: ["issue-triage"],
            why_new: "This is narrower than issue triage.",
          },
          maintainer_decisions: [{ question: "Accept the skill?" }],
          acceptance_checks: [{ id: "ac-1" }, { id: "ac-2" }, { id: "ac-3" }],
          harness_fixture: [
            {
              target: "../decision-brief",
              inputs: {
                subject_memory: {
                  thread: {
                    comments: [
                      {
                        body: "Remove builder residue and placeholder language.",
                      },
                    ],
                  },
                },
              },
            },
          ],
        }),
      },
    },
    catalogEntries: ["issue-triage"],
  });

  assert.equal(evaluation.checks.placeholder_free, true);
  assert.equal(evaluation.status, "pass");
});

test("evaluateSkillProposalQuality flags builder residue and missing catalog fit", () => {
  const evaluation = evaluateSkillProposalQuality({
    report: {
      execution: {
        stdout: JSON.stringify({
          skill_spec: {
            name: "decision-brief",
            summary: "Use the supplied decomposition to design the current issue #115 skill.",
          },
          acceptance_checks: [{ id: "ac-1" }, { id: "ac-2" }, { id: "ac-3" }],
          harness_fixture: [
            {
              target: "UNRESOLVED_SKILL_TARGET",
            },
          ],
          execution_plan: {
            open_questions_left_out_of_scope: ["What artifact form should hold the proposal?"],
          },
        }),
      },
    },
    catalogEntries: ["issue-triage", "skill-lab", "issue-to-pr"],
  });

  assert.equal(evaluation.status, "needs_review");
  assert.equal(evaluation.checks.builder_residue_free, false);
  assert.equal(evaluation.checks.catalog_fit_explicit, false);
  assert.equal(evaluation.checks.placeholder_free, false);
  assert.match(evaluation.findings.map((item) => item.summary).join("\n"), /current runx catalog/);
});
