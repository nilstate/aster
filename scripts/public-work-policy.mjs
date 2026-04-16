export function evaluatePublicPullRequestCandidate({
  authorLogin,
  title,
  labels,
  headRefName,
}) {
  const reasons = [];
  if (isBotLogin(authorLogin)) {
    reasons.push("bot_authored_pull_request");
  }
  if (isDependencyUpdatePullRequest({ title, labels, headRefName })) {
    reasons.push("dependency_update_pull_request");
  }
  if (hasInternalOnlyPullRequestLabels(labels)) {
    reasons.push("internal_or_build_only_pull_request");
  }
  return {
    blocked: reasons.length > 0,
    reasons,
  };
}

export function evaluatePublicCommentOpportunity({
  source,
  lane,
  authorLogin,
  authorAssociation,
  title,
  labels,
  headRefName,
  commentsCount,
  reviewCommentsCount,
  recentOutcomes = [],
}) {
  const reasons = [];
  const pullRequestPolicy = evaluatePublicPullRequestCandidate({
    authorLogin,
    title,
    labels,
    headRefName,
  });
  reasons.push(...pullRequestPolicy.reasons);

  const welcomeSignal = hasWelcomeSignal({
    source,
    authorAssociation,
    commentsCount,
    reviewCommentsCount,
  });
  if (source === "github_pull_request" && lane === "issue-triage" && !welcomeSignal) {
    reasons.push("comment_without_welcome_signal");
  }
  if (isCommentLaneInTrustRecovery({ lane, recentOutcomes })) {
    reasons.push("comment_lane_in_trust_recovery");
  }

  return {
    blocked: reasons.length > 0,
    reasons,
    welcome_signal: welcomeSignal,
  };
}

export function isBotLogin(value) {
  const login = String(value ?? "").trim().toLowerCase();
  if (!login) {
    return false;
  }
  return (
    login.endsWith("[bot]") ||
    login.startsWith("app/") ||
    login.startsWith("renovate") ||
    login.startsWith("dependabot") ||
    login === "github-actions" ||
    login === "github-actions[bot]"
  );
}

export function isDependencyUpdatePullRequest({
  title,
  labels,
  headRefName,
}) {
  const normalizedLabels = normalizeLabels(labels);
  const normalizedTitle = String(title ?? "").trim().toLowerCase();
  const normalizedHead = String(headRefName ?? "").trim().toLowerCase();

  if (normalizedHead.startsWith("renovate/") || normalizedHead.startsWith("dependabot/")) {
    return true;
  }
  if (normalizedLabels.some((label) => DEPENDENCY_LABELS.has(label))) {
    return true;
  }
  if (/(^|\b)(update|upgrade|bump)(\b|:)/.test(normalizedTitle) && /\bv?\d+\.\d+/.test(normalizedTitle)) {
    return true;
  }
  if (/dependency|dependencies|deps\b/.test(normalizedTitle)) {
    return true;
  }
  return false;
}

export function hasInternalOnlyPullRequestLabels(labels) {
  const normalizedLabels = normalizeLabels(labels);
  return normalizedLabels.some((label) => {
    return label === "internal" || label.startsWith("build:") || label.startsWith("release:");
  });
}

export function normalizeLabels(labels) {
  return Array.isArray(labels)
    ? labels
      .map((label) => String(label ?? "").trim().toLowerCase())
      .filter(Boolean)
    : [];
}

export function hasWelcomeSignal({
  source,
  authorAssociation,
  commentsCount,
  reviewCommentsCount,
}) {
  if (source !== "github_pull_request") {
    return true;
  }
  if (["OWNER", "MEMBER", "COLLABORATOR", "CONTRIBUTOR"].includes(String(authorAssociation ?? "").toUpperCase())) {
    return true;
  }
  return Number(commentsCount ?? 0) + Number(reviewCommentsCount ?? 0) > 0;
}

export function isCommentLaneInTrustRecovery({ lane, recentOutcomes }) {
  if (lane !== "issue-triage") {
    return false;
  }
  return Array.isArray(recentOutcomes)
    && recentOutcomes.some((entry) => isSevereOutcomeStatus(entry?.status));
}

export function isSevereOutcomeStatus(value) {
  return ["spam", "minimized", "harmful"].includes(String(value ?? "").trim().toLowerCase());
}

const DEPENDENCY_LABELS = new Set([
  "dependencies",
  "dependency",
  "deps",
  "rust dependencies",
  "javascript dependencies",
  "python dependencies",
  "artifact drift",
  "artifact-update",
  "artifact update",
]);
