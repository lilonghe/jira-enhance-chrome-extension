(() => {
  const JiraEnhance = globalThis.JiraEnhance || (globalThis.JiraEnhance = {});
  const { config } = JiraEnhance;

  const issueCache = new Map();

  async function fetchJson(url) {
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json();
  }

  // Jira issue payloads are inconsistent across endpoints, so this keeps the
  // rest of the UI working with one stable shape for rows in the popover.
  function normalizeIssuePreview(issue, detailedFields, options = {}) {
    if (!issue?.key) {
      return null;
    }

    const { includeAssignee = false } = options;
    const fields = detailedFields || issue.fields || {};
    const summary = pickText(fields.summary) || pickText(issue.fields?.summary) || issue.key;
    const statusName = pickText(fields.status?.name) || pickText(issue.fields?.status?.name) || "Unknown";
    const issueTypeName = pickText(fields.issuetype?.name) || pickText(issue.fields?.issuetype?.name);
    const statusColor =
      pickText(fields.status?.statusCategory?.colorName) ||
      pickText(issue.fields?.status?.statusCategory?.colorName) ||
      "medium-gray";
    const preview = {
      issueTypeName,
      key: issue.key,
      statusColor,
      statusName,
      summary
    };

    if (includeAssignee) {
      preview.assigneeName = pickText(fields.assignee?.displayName) || "Unassigned";
    }

    return preview;
  }

  function normalizeIssueTypeName(value) {
    return pickText(value).toLowerCase();
  }

  function isBugIssueTypeName(value) {
    const normalized = normalizeIssueTypeName(value);
    if (!normalized) {
      return false;
    }

    return config.BUG_ISSUE_TYPE_NAMES.some((issueTypeName) => normalizeIssueTypeName(issueTypeName) === normalized);
  }

  function isBlockedByIssueLink(issueLink) {
    if (!issueLink?.inwardIssue) {
      return false;
    }

    const inwardLabel = pickText(issueLink?.type?.inward).toLowerCase();
    const typeName = pickText(issueLink?.type?.name).toLowerCase();

    return (
      inwardLabel.includes("blocked by") ||
      inwardLabel.includes("阻塞") ||
      typeName.includes("block") ||
      typeName.includes("阻塞")
    );
  }

  async function fetchIssueFields(issueKeys, fieldQuery) {
    if (!issueKeys.length) {
      return new Map();
    }

    const jql = `issueKey in (${issueKeys.map((key) => `"${key}"`).join(",")})`;
    const payload = await fetchJson(
      `/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=${encodeURIComponent(
        fieldQuery
      )}&maxResults=${issueKeys.length}`
    );
    const fieldsByKey = new Map();

    for (const issue of payload.issues || []) {
      if (issue?.key) {
        fieldsByKey.set(issue.key, issue.fields || {});
      }
    }

    return fieldsByKey;
  }

  // Jira link labels vary a bit between instances, so the blocked-bug section
  // keeps inward links whose type metadata still clearly reads as "blocked by".
  function extractBlockedByIssues(issueLinks) {
    return (Array.isArray(issueLinks) ? issueLinks : [])
      .filter(isBlockedByIssueLink)
      .map((issueLink) => normalizeIssuePreview(issueLink?.inwardIssue))
      .filter((issue) => isBugIssueTypeName(issue?.issueTypeName))
      .filter(Boolean);
  }

  // Load the parent issue first, then hydrate subtasks with richer fields from
  // search so the popover can render status and assignee reliably.
  async function fetchIssueData(issueKey) {
    const cached = issueCache.get(issueKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const payload = await fetchJson(
      `/rest/api/2/issue/${encodeURIComponent(issueKey)}?fields=${encodeURIComponent(config.ISSUE_FIELDS_QUERY)}`
    );
    const rawSubtasks = Array.isArray(payload.fields?.subtasks) ? payload.fields.subtasks : [];
    const subtaskFieldsByKey = rawSubtasks.length
      ? await fetchIssueFields(
          rawSubtasks.map((subtask) => subtask.key).filter(Boolean),
          config.SUBTASK_FIELDS_QUERY
        )
      : new Map();
    const data = {
      blockedByIssues: extractBlockedByIssues(payload.fields?.issuelinks),
      summary: pickText(payload.fields?.summary) || issueKey,
      subtasks: rawSubtasks
        .map((subtask) => normalizeIssuePreview(subtask, subtaskFieldsByKey.get(subtask.key), { includeAssignee: true }))
        .filter(Boolean)
    };

    issueCache.set(issueKey, {
      data,
      expiresAt: Date.now() + config.CACHE_TTL_MS
    });

    return data;
  }

  function pickText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  JiraEnhance.api = {
    fetchIssueData
  };
})();
