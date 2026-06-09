(() => {
  const JiraEnhance = globalThis.JiraEnhance || (globalThis.JiraEnhance = {});

  function normalizeDelayMs(value) {
    const parsed = Number(String(value).trim());
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  }

  function normalizeCardDateFormat(value) {
    const text = String(value ?? "").trim();
    return text || "YYYY-MM-DD";
  }

  JiraEnhance.config = Object.freeze({
    SHOW_DELAY_MS: 180,
    HIDE_DELAY_MS: 200,
    CACHE_TTL_MS: 60_000,
    LAYOUT_MODE_STORAGE_KEY: "jira-subtasks-hover:layout-mode",
    DEFAULT_LAYOUT_MODE: "grouped",
    SHOW_BLOCKED_BUGS_STORAGE_KEY: "jira-enhance:show-blocked-bugs",
    DEFAULT_SHOW_BLOCKED_BUGS: true,
    CARD_DATE_FORMAT_STORAGE_KEY: "jira-enhance:card-date-format",
    DEFAULT_CARD_DATE_FORMAT: "YYYY-MM-DD",
    EMPTY_AUTO_CLOSE_MS_STORAGE_KEY: "jira-enhance:empty-auto-close-ms",
    DEFAULT_EMPTY_AUTO_CLOSE_MS: 0,
    ISSUE_KEY_RE: /\b[A-Z][A-Z0-9_]+-\d+\b/,
    ISSUE_TYPE_FILTER_STORAGE_KEY: "jira-enhance:issue-type-filters",
    CARD_SELECTOR: [
      "[data-issue-key]",
      ".ghx-issue",
      '[data-testid*="board.card"]',
      '[data-testid*="card.card"]',
      '[data-component-selector*="card.card"]'
    ].join(","),
    ISSUE_KEY_ATTRIBUTES: ["data-issue-key", "data-key", "issue-key"],
    ISSUE_TYPE_SELECTORS: [
      '[data-testid*="issue-type"]',
      '[data-testid*="issuetype"]',
      '[data-component-selector*="issue-type"]',
      '[data-component-selector*="issuetype"]',
      'img[src*="issuetype"][alt]'
    ].join(","),
    ISSUE_TYPE_ATTRIBUTE_NAMES: ["data-tooltip-content", "aria-label", "title", "alt"],
    DEFAULT_SKIPPED_ISSUE_TYPES: ["Bug", "Defect", "缺陷", "故障"],
    BUG_ISSUE_TYPE_NAMES: ["Bug", "Defect", "缺陷", "故障"],
    SUMMARY_SELECTORS: [
      '[data-testid*="summary"]',
      '[data-component-selector*="summary"]',
      '[role="heading"]'
    ],
    ISSUE_FIELDS_QUERY: "summary,subtasks,issuelinks",
    SUBTASK_FIELDS_QUERY: "summary,status,assignee"
  });
  JiraEnhance.normalizeCardDateFormat = normalizeCardDateFormat;
  JiraEnhance.normalizeDelayMs = normalizeDelayMs;
})();
