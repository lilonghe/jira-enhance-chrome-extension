(() => {
  const JiraEnhance = globalThis.JiraEnhance || (globalThis.JiraEnhance = {});
  const { config, normalizeDelayMs } = JiraEnhance;

  const layoutModeInputs = Array.from(document.querySelectorAll('input[name="layout-mode"]'));
  const showBlockedBugsInput = document.querySelector("#show-blocked-bugs");
  const emptyAutoCloseMsInput = document.querySelector("#empty-auto-close-ms");
  const issueTypeFiltersInput = document.querySelector("#issue-type-filters");
  const saveButton = document.querySelector("#save-button");
  const resetButton = document.querySelector("#reset-button");
  const status = document.querySelector("#status");

  init();

  async function init() {
    await restoreFilters();
    saveButton.addEventListener("click", saveFilters);
    resetButton.addEventListener("click", resetFilters);
  }

  async function restoreFilters() {
    const result = await chrome.storage.sync.get({
      [config.ISSUE_TYPE_FILTER_STORAGE_KEY]: config.DEFAULT_SKIPPED_ISSUE_TYPES,
      [config.LAYOUT_MODE_STORAGE_KEY]: config.DEFAULT_LAYOUT_MODE,
      [config.SHOW_BLOCKED_BUGS_STORAGE_KEY]: config.DEFAULT_SHOW_BLOCKED_BUGS,
      [config.EMPTY_AUTO_CLOSE_MS_STORAGE_KEY]: config.DEFAULT_EMPTY_AUTO_CLOSE_MS
    });

    setLayoutMode(result[config.LAYOUT_MODE_STORAGE_KEY]);
    showBlockedBugsInput.checked = Boolean(result[config.SHOW_BLOCKED_BUGS_STORAGE_KEY]);
    emptyAutoCloseMsInput.value = String(normalizeDelayMs(result[config.EMPTY_AUTO_CLOSE_MS_STORAGE_KEY]));
    issueTypeFiltersInput.value = toInputValue(result[config.ISSUE_TYPE_FILTER_STORAGE_KEY]);
  }

  // Keep the saved value normalized so content scripts can use it directly
  // without guessing how to interpret commas, whitespace, or duplicates.
  async function saveFilters() {
    const layoutMode = getSelectedLayoutMode();
    const showBlockedBugs = showBlockedBugsInput.checked;
    const emptyAutoCloseMs = normalizeDelayMs(emptyAutoCloseMsInput.value);
    const filters = normalizeFilters(issueTypeFiltersInput.value);
    await chrome.storage.sync.set({
      [config.LAYOUT_MODE_STORAGE_KEY]: layoutMode,
      [config.SHOW_BLOCKED_BUGS_STORAGE_KEY]: showBlockedBugs,
      [config.EMPTY_AUTO_CLOSE_MS_STORAGE_KEY]: emptyAutoCloseMs,
      [config.ISSUE_TYPE_FILTER_STORAGE_KEY]: filters
    });

    setLayoutMode(layoutMode);
    showBlockedBugsInput.checked = showBlockedBugs;
    emptyAutoCloseMsInput.value = String(emptyAutoCloseMs);
    issueTypeFiltersInput.value = toInputValue(filters);
    showStatus("Saved.");
  }

  async function resetFilters() {
    const layoutMode = config.DEFAULT_LAYOUT_MODE;
    const showBlockedBugs = config.DEFAULT_SHOW_BLOCKED_BUGS;
    const emptyAutoCloseMs = config.DEFAULT_EMPTY_AUTO_CLOSE_MS;
    const defaults = config.DEFAULT_SKIPPED_ISSUE_TYPES.slice();
    await chrome.storage.sync.set({
      [config.LAYOUT_MODE_STORAGE_KEY]: layoutMode,
      [config.SHOW_BLOCKED_BUGS_STORAGE_KEY]: showBlockedBugs,
      [config.EMPTY_AUTO_CLOSE_MS_STORAGE_KEY]: emptyAutoCloseMs,
      [config.ISSUE_TYPE_FILTER_STORAGE_KEY]: defaults
    });

    setLayoutMode(layoutMode);
    showBlockedBugsInput.checked = showBlockedBugs;
    emptyAutoCloseMsInput.value = String(emptyAutoCloseMs);
    issueTypeFiltersInput.value = toInputValue(defaults);
    showStatus("Reset to defaults.");
  }

  function normalizeFilters(value) {
    return Array.from(
      new Set(
        String(value)
          .split(/[,\n，]+/)
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
  }

  function toInputValue(filters) {
    return (Array.isArray(filters) ? filters : []).join(",");
  }

  function getSelectedLayoutMode() {
    return layoutModeInputs.find((input) => input.checked)?.value === "list" ? "list" : config.DEFAULT_LAYOUT_MODE;
  }

  function setLayoutMode(layoutMode) {
    const normalized = layoutMode === "list" ? "list" : config.DEFAULT_LAYOUT_MODE;

    for (const input of layoutModeInputs) {
      input.checked = input.value === normalized;
    }
  }

  function showStatus(message) {
    status.textContent = message;
    window.clearTimeout(showStatus.timerId);
    showStatus.timerId = window.setTimeout(() => {
      status.textContent = "";
    }, 1800);
  }
})();
