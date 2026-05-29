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

  // Jira's subtask payloads are inconsistent across endpoints, so this keeps
  // the rest of the UI working with one stable shape.
  function normalizeSubtask(subtask, detailedFields) {
    if (!subtask?.key) {
      return null;
    }

    const fields = detailedFields || subtask.fields || {};
    const summary = pickText(fields.summary) || pickText(subtask.fields?.summary) || subtask.key;
    const statusName = pickText(fields.status?.name) || pickText(subtask.fields?.status?.name) || "Unknown";
    const statusColor =
      pickText(fields.status?.statusCategory?.colorName) ||
      pickText(subtask.fields?.status?.statusCategory?.colorName) ||
      "medium-gray";
    const assigneeName = pickText(fields.assignee?.displayName) || "Unassigned";

    return {
      assigneeName,
      key: subtask.key,
      statusColor,
      statusName,
      summary
    };
  }

  async function fetchSubtaskFields(issueKeys) {
    if (!issueKeys.length) {
      return new Map();
    }

    const jql = `issueKey in (${issueKeys.map((key) => `"${key}"`).join(",")})`;
    const payload = await fetchJson(
      `/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=${encodeURIComponent(
        config.SUBTASK_FIELDS_QUERY
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
      ? await fetchSubtaskFields(rawSubtasks.map((subtask) => subtask.key).filter(Boolean))
      : new Map();
    const data = {
      summary: pickText(payload.fields?.summary) || issueKey,
      subtasks: rawSubtasks
        .map((subtask) => normalizeSubtask(subtask, subtaskFieldsByKey.get(subtask.key)))
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
