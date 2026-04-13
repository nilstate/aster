import test from "node:test";
import assert from "node:assert/strict";

import {
  extractOutputTextCandidates,
  shouldFallbackToChatCompletions,
} from "./runx-agent-bridge.mjs";

test("shouldFallbackToChatCompletions recognizes missing responses scope", () => {
  assert.equal(
    shouldFallbackToChatCompletions({
      response: { statusCode: 401 },
      parsed: {
        error: {
          message: "Missing scopes: api.responses.write",
        },
      },
    }),
    true,
  );
});

test("shouldFallbackToChatCompletions ignores unrelated failures", () => {
  assert.equal(
    shouldFallbackToChatCompletions({
      response: { statusCode: 400 },
      parsed: {
        error: {
          message: "Bad request",
        },
      },
    }),
    false,
  );
});

test("extractOutputTextCandidates supports chat completion payloads", () => {
  assert.deepEqual(
    extractOutputTextCandidates({
      choices: [
        {
          message: {
            content: "{\"ok\":true}",
          },
        },
      ],
    }),
    ["{\"ok\":true}"],
  );
});
