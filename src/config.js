(() => {
  const JiraEnhance = globalThis.JiraEnhance || (globalThis.JiraEnhance = {});

  JiraEnhance.config = Object.freeze({
    SHOW_DELAY_MS: 180,
    HIDE_DELAY_MS: 200,
    CACHE_TTL_MS: 60_000,
    LAYOUT_MODE_STORAGE_KEY: "jira-subtasks-hover:layout-mode",
    ISSUE_KEY_RE: /\b[A-Z][A-Z0-9_]+-\d+\b/,
    CARD_SELECTOR: [
      "[data-issue-key]",
      ".ghx-issue",
      '[data-testid*="board.card"]',
      '[data-testid*="card.card"]',
      '[data-component-selector*="card.card"]'
    ].join(","),
    ISSUE_KEY_ATTRIBUTES: ["data-issue-key", "data-key", "issue-key"],
    SUMMARY_SELECTORS: [
      '[data-testid*="summary"]',
      '[data-component-selector*="summary"]',
      '[role="heading"]'
    ],
    ISSUE_FIELDS_QUERY: "summary,subtasks",
    SUBTASK_FIELDS_QUERY: "summary,status,assignee"
  });
})();
