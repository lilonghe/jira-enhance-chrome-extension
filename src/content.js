(() => {
  const JiraEnhance = globalThis.JiraEnhance || (globalThis.JiraEnhance = {});
  const { api, config, normalizeCardDateFormat, normalizeDelayMs, presentation, view } = JiraEnhance;
  const DRAG_TRIGGER_DISTANCE_PX = 6;
  const HOLD_TRIGGER_MS = 160;
  const CARD_DATE_TEXT_RE = /^(\d{1,2})\/([^/\s]+)\/(\d{2}|\d{4})$/i;
  const CARD_MONTH_MAP = Object.freeze({
    "1": 1,
    "01": 1,
    "1月": 1,
    "01月": 1,
    jan: 1,
    january: 1,
    "一月": 1,
    "2": 2,
    "02": 2,
    "2月": 2,
    "02月": 2,
    feb: 2,
    february: 2,
    "二月": 2,
    "3": 3,
    "03": 3,
    "3月": 3,
    "03月": 3,
    mar: 3,
    march: 3,
    "三月": 3,
    "4": 4,
    "04": 4,
    "4月": 4,
    "04月": 4,
    apr: 4,
    april: 4,
    "四月": 4,
    "5": 5,
    "05": 5,
    "5月": 5,
    "05月": 5,
    may: 5,
    "五月": 5,
    "6": 6,
    "06": 6,
    "6月": 6,
    "06月": 6,
    jun: 6,
    june: 6,
    "六月": 6,
    "7": 7,
    "07": 7,
    "7月": 7,
    "07月": 7,
    jul: 7,
    july: 7,
    "七月": 7,
    "8": 8,
    "08": 8,
    "8月": 8,
    "08月": 8,
    aug: 8,
    august: 8,
    "八月": 8,
    "9": 9,
    "09": 9,
    "9月": 9,
    "09月": 9,
    sep: 9,
    sept: 9,
    september: 9,
    "九月": 9,
    "10": 10,
    "10月": 10,
    oct: 10,
    october: 10,
    "十月": 10,
    "11": 11,
    "11月": 11,
    nov: 11,
    november: 11,
    "十一月": 11,
    "12": 12,
    "12月": 12,
    dec: 12,
    december: 12,
    "十二月": 12
  });

  const state = {
    activeCard: null,
    activeIssueData: null,
    activeIssueKey: "",
    blockedByCollapsed: true,
    cardDateFormat: config.DEFAULT_CARD_DATE_FORMAT,
    collapsedGroups: new Set(),
    collapsedGroupsInitialized: false,
    currentRequestId: 0,
    dateRefreshFrame: 0,
    emptyAutoCloseMs: config.DEFAULT_EMPTY_AUTO_CLOSE_MS,
    emptyAutoHideTimer: 0,
    hideTimer: 0,
    hoverCard: null,
    isRefreshingCardDates: false,
    isGhostPopover: false,
    issueTypeFilters: normalizeIssueTypeFilters(config.DEFAULT_SKIPPED_ISSUE_TYPES),
    layoutMode: config.DEFAULT_LAYOUT_MODE,
    showBlockedBugs: config.DEFAULT_SHOW_BLOCKED_BUGS,
    pointerDownCard: null,
    pointerDownX: 0,
    pointerDownY: 0,
    pressTimer: 0,
    popover: null,
    popoverHovered: false,
    suppressHover: false,
    showTimer: 0
  };

  init();

  function init() {
    ensurePopover();
    startCardDateSync();
    loadSettings();
    chrome.storage.onChanged.addListener(handleStorageChange);
    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("mouseup", handleMouseUp, true);
    document.addEventListener("mouseover", handleMouseOver, true);
    document.addEventListener("mouseout", handleMouseOut, true);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);
  }

  function ensurePopover() {
    if (state.popover) {
      return state.popover;
    }

    const popover = document.createElement("section");
    popover.id = "jira-subtasks-hover-popover";
    popover.hidden = true;
    popover.addEventListener("click", handlePopoverClick);
    popover.addEventListener("mouseenter", () => {
      state.popoverHovered = true;
      clearHideTimer();
    });
    popover.addEventListener("mouseleave", () => {
      state.popoverHovered = false;
      scheduleHide();
    });

    document.documentElement.appendChild(popover);
    state.popover = popover;
    return popover;
  }

  function handleMouseOver(event) {
    if (state.suppressHover) {
      return;
    }

    const card = findIssueCard(event.target);
    if (!card) {
      return;
    }

    const previousCard = findIssueCard(event.relatedTarget);
    if (card === previousCard) {
      return;
    }

    const issue = readIssueMeta(card);
    if (!issue.key) {
      return;
    }

    if (shouldSkipIssueType(issue.issueTypeName)) {
      return;
    }

    state.hoverCard = card;
    clearHideTimer();
    clearShowTimer();
    state.showTimer = window.setTimeout(() => {
      showPopover(card, issue);
    }, config.SHOW_DELAY_MS);
  }

  function handleMouseOut(event) {
    const card = findIssueCard(event.target);
    if (!card) {
      return;
    }

    const nextCard = findIssueCard(event.relatedTarget);
    if (card === nextCard) {
      return;
    }

    if (state.hoverCard === card) {
      state.hoverCard = null;
    }

    scheduleHide();
  }

  function handleMouseDown(event) {
    const card = findIssueCard(event.target);
    if (!card) {
      return;
    }

    state.pointerDownCard = card;
    state.pointerDownX = event.clientX;
    state.pointerDownY = event.clientY;
    clearPressTimer();
    state.pressTimer = window.setTimeout(() => {
      suppressHoverForDrag();
    }, HOLD_TRIGGER_MS);
  }

  function handleMouseMove(event) {
    if (!state.pointerDownCard || state.suppressHover) {
      return;
    }

    const deltaX = Math.abs(event.clientX - state.pointerDownX);
    const deltaY = Math.abs(event.clientY - state.pointerDownY);
    if (Math.max(deltaX, deltaY) < DRAG_TRIGGER_DISTANCE_PX) {
      return;
    }

    suppressHoverForDrag();
  }

  function handleMouseUp() {
    clearPressTimer();
    state.pointerDownCard = null;
    state.pointerDownX = 0;
    state.pointerDownY = 0;
    state.suppressHover = false;
  }

  function handleViewportChange() {
    if (!state.popover || state.popover.hidden) {
      return;
    }

    if (!state.activeCard || !state.activeCard.isConnected) {
      hidePopover(true);
      return;
    }

    positionPopover(state.activeCard);
  }

  function scheduleHide() {
    clearHideTimer();
    state.hideTimer = window.setTimeout(() => {
      if (state.hoverCard || state.popoverHovered) {
        return;
      }

      hidePopover(true);
    }, config.HIDE_DELAY_MS);
  }

  // Render a lightweight shell immediately so hover feels responsive even when
  // Jira's REST API is a little slow.
  function showPopover(card, issue) {
    if (!card.isConnected) {
      return;
    }

    beginIssueSession(card, issue.key);

    const popover = ensurePopover();
    popover.hidden = false;
    syncPopoverTone(popover, true);
    popover.replaceChildren(view.buildHeader(issue.key, "Loading"), view.buildLoadingBody());
    positionPopover(card);

    const requestId = ++state.currentRequestId;
    loadIssueIntoPopover(issue, requestId);
  }

  async function loadIssueIntoPopover(issue, requestId) {
    try {
      const data = await api.fetchIssueData(issue.key);
      if (!isLatestRequest(issue.key, requestId)) {
        return;
      }

      state.activeIssueData = data;
      renderIssue(issue.key, data);
    } catch (error) {
      if (!isLatestRequest(issue.key, requestId)) {
        return;
      }

      state.activeIssueData = null;
      renderError(issue.key, error);
    }
  }

  async function loadSettings() {
    const result = await chrome.storage.sync.get({
      [config.CARD_DATE_FORMAT_STORAGE_KEY]: config.DEFAULT_CARD_DATE_FORMAT,
      [config.EMPTY_AUTO_CLOSE_MS_STORAGE_KEY]: config.DEFAULT_EMPTY_AUTO_CLOSE_MS,
      [config.ISSUE_TYPE_FILTER_STORAGE_KEY]: config.DEFAULT_SKIPPED_ISSUE_TYPES,
      [config.LAYOUT_MODE_STORAGE_KEY]: config.DEFAULT_LAYOUT_MODE,
      [config.SHOW_BLOCKED_BUGS_STORAGE_KEY]: config.DEFAULT_SHOW_BLOCKED_BUGS
    });

    state.cardDateFormat = normalizeCardDateFormat(result[config.CARD_DATE_FORMAT_STORAGE_KEY]);
    state.emptyAutoCloseMs = normalizeDelayMs(result[config.EMPTY_AUTO_CLOSE_MS_STORAGE_KEY]);
    state.issueTypeFilters = normalizeIssueTypeFilters(result[config.ISSUE_TYPE_FILTER_STORAGE_KEY]);
    state.layoutMode = normalizeLayoutMode(result[config.LAYOUT_MODE_STORAGE_KEY]);
    state.showBlockedBugs = Boolean(result[config.SHOW_BLOCKED_BUGS_STORAGE_KEY]);
    scheduleCardDateRefresh();
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== "sync") {
      return;
    }

    const nextValue = changes[config.ISSUE_TYPE_FILTER_STORAGE_KEY]?.newValue;
    if (nextValue !== undefined) {
      state.issueTypeFilters = normalizeIssueTypeFilters(nextValue);
    }

    const nextCardDateFormat = changes[config.CARD_DATE_FORMAT_STORAGE_KEY]?.newValue;
    if (nextCardDateFormat !== undefined) {
      state.cardDateFormat = normalizeCardDateFormat(nextCardDateFormat);
      scheduleCardDateRefresh();
    }

    const nextEmptyAutoCloseMs = changes[config.EMPTY_AUTO_CLOSE_MS_STORAGE_KEY]?.newValue;
    if (nextEmptyAutoCloseMs !== undefined) {
      state.emptyAutoCloseMs = normalizeDelayMs(nextEmptyAutoCloseMs);

      if (state.activeIssueKey && state.activeIssueData) {
        renderIssue(state.activeIssueKey, state.activeIssueData);
      }
    }

    const nextLayoutMode = changes[config.LAYOUT_MODE_STORAGE_KEY]?.newValue;
    if (nextLayoutMode !== undefined) {
      state.layoutMode = normalizeLayoutMode(nextLayoutMode);

      if (state.activeIssueKey && state.activeIssueData) {
        renderIssue(state.activeIssueKey, state.activeIssueData);
      }
    }

    const nextShowBlockedBugs = changes[config.SHOW_BLOCKED_BUGS_STORAGE_KEY]?.newValue;
    if (nextShowBlockedBugs !== undefined) {
      state.showBlockedBugs = Boolean(nextShowBlockedBugs);

      if (state.activeIssueKey && state.activeIssueData) {
        renderIssue(state.activeIssueKey, state.activeIssueData);
      }
    }
  }

  // Keep the controller focused on wiring: presentation decides what to show
  // and the view module turns that model into DOM nodes.
  function renderIssue(issueKey, issueData) {
    const popover = ensurePopover();
    const scrollTop = readBodyScrollTop(popover);
    const model = presentation.buildPresentationModel(issueData.subtasks, state.layoutMode);
    const body = createBodyNode();
    const blockedBySection = state.showBlockedBugs
      ? view.buildBlockedBySection(issueData.blockedByIssues, state.blockedByCollapsed)
      : null;

    if (blockedBySection) {
      body.appendChild(blockedBySection);
    }

    if (model.emptyState) {
      body.appendChild(view.buildState(model.emptyState.title, model.emptyState.copy));
    } else if (model.layoutMode === "grouped") {
      initializeCollapsedGroups(issueKey, model.groups);
      body.appendChild(view.buildGroupedContent(issueKey, model.groups, state.collapsedGroups));
    } else {
      body.appendChild(view.buildFlatList(model.items));
    }

    const useGhostTone = shouldUseGhostTone(model, blockedBySection);
    syncPopoverTone(popover, useGhostTone);
    syncEmptyAutoClose(useGhostTone);
    popover.replaceChildren(view.buildHeader(issueKey, model.metric), body);
    body.scrollTop = scrollTop;
    if (state.activeCard) {
      positionPopover(state.activeCard);
    }
  }

  function renderError(issueKey, error) {
    const popover = ensurePopover();
    const scrollTop = readBodyScrollTop(popover);
    const message = error instanceof Error ? error.message : "Unknown error";
    const body = createBodyNode();

    body.appendChild(view.buildState("Could not load subtasks", `Jira returned an error while loading this issue: ${message}`));
    syncPopoverTone(popover, false);
    syncEmptyAutoClose(false);
    popover.replaceChildren(view.buildHeader(issueKey, "Unavailable"), body);
    body.scrollTop = scrollTop;

    if (state.activeCard) {
      positionPopover(state.activeCard);
    }
  }

  function hidePopover(immediate) {
    clearShowTimer();
    if (!immediate) {
      scheduleHide();
      return;
    }

    clearEmptyAutoHideTimer();
    clearHideTimer();
    state.activeCard = null;
    state.activeIssueData = null;
    state.activeIssueKey = "";
    state.blockedByCollapsed = true;
    state.collapsedGroups = new Set();
    state.collapsedGroupsInitialized = false;
    state.currentRequestId += 1;
    state.hoverCard = null;
    state.isGhostPopover = false;
    state.popoverHovered = false;

    if (state.popover) {
      state.popover.hidden = true;
      state.popover.replaceChildren();
    }
  }

  function handlePopoverClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    const openSettings = target.closest('[data-action="open-settings"]');
    if (openSettings) {
      event.preventDefault();
      event.stopPropagation();
      openSettingsPage();
      return;
    }

    const toggleGroup = target.closest('[data-action="toggle-group"]');
    if (toggleGroup instanceof HTMLElement) {
      event.preventDefault();
      const groupKey = toggleGroup.dataset.groupKey || "";
      if (!groupKey) {
        return;
      }

      if (state.collapsedGroups.has(groupKey)) {
        state.collapsedGroups.delete(groupKey);
      } else {
        state.collapsedGroups.add(groupKey);
      }

      if (state.activeIssueKey && state.activeIssueData) {
        renderIssue(state.activeIssueKey, state.activeIssueData);
      }
      return;
    }

    const toggleBlockedBy = target.closest('[data-action="toggle-blocked-by"]');
    if (toggleBlockedBy) {
      event.preventDefault();
      state.blockedByCollapsed = !state.blockedByCollapsed;

      if (state.activeIssueKey && state.activeIssueData) {
        renderIssue(state.activeIssueKey, state.activeIssueData);
      }
    }
  }

  // Seed collapsed state once per hovered issue so cancelled-only groups start
  // folded, but user toggles still persist across rerenders for that popover.
  function initializeCollapsedGroups(issueKey, groups) {
    if (state.collapsedGroupsInitialized) {
      return;
    }

    state.collapsedGroups = new Set(
      groups
        .filter((group) => group.isCancelledOnly)
        .map((group) => presentation.buildGroupStateKey(issueKey, group.assigneeName))
    );
    state.collapsedGroupsInitialized = true;
  }

  function findIssueCard(target) {
    let element = target instanceof Element ? target : null;

    while (element && element !== document.body) {
      if (looksLikeIssueCard(element)) {
        return element;
      }

      element = element.parentElement;
    }

    return null;
  }

  // Jira board markup differs between Cloud layouts and older boards, so card
  // discovery uses a selector-first check and then falls back to geometry/text.
  function looksLikeIssueCard(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (!extractIssueKey(element)) {
      return false;
    }

    if (element.matches(config.CARD_SELECTOR)) {
      return true;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 40) {
      return false;
    }

    const testId = element.getAttribute("data-testid") || "";
    const selector = element.getAttribute("data-component-selector") || "";

    return testId.includes("card") || selector.includes("card") || element.getAttribute("role") === "listitem";
  }

  function readIssueMeta(card) {
    const key = extractIssueKey(card);

    return {
      issueTypeName: extractIssueType(card),
      key,
      summary: extractCardSummary(card)
    };
  }

  // Jira usually exposes issue type on the card icon via alt, title, aria-label,
  // or tooltip text. We keep the selector list narrow so random card controls do
  // not get mistaken for the issue type.
  function extractIssueType(card) {
    const candidates = [card, ...card.querySelectorAll(config.ISSUE_TYPE_SELECTORS)];

    for (const element of candidates) {
      if (!(element instanceof Element)) {
        continue;
      }

      for (const attribute of config.ISSUE_TYPE_ATTRIBUTE_NAMES) {
        const value = normalizeIssueTypeName(element.getAttribute(attribute));
        if (value) {
          return value;
        }
      }

      const text = normalizeIssueTypeName(element.textContent);
      if (text) {
        return text;
      }
    }

    return "";
  }

  // Keys can show up in multiple places depending on the board implementation,
  // so we walk through the cheapest, most explicit sources first.
  function extractIssueKey(root) {
    if (!(root instanceof Element)) {
      return "";
    }

    for (const attribute of config.ISSUE_KEY_ATTRIBUTES) {
      const value = pickText(root.getAttribute(attribute));
      if (isIssueKey(value)) {
        return value.toUpperCase();
      }
    }

    const directHref = root instanceof HTMLAnchorElement ? root.getAttribute("href") : "";
    const directKey = extractIssueKeyFromHref(directHref);
    if (directKey) {
      return directKey;
    }

    const browseLink = root.querySelector('a[href*="/browse/"]');
    const nestedKey = extractIssueKeyFromHref(browseLink?.getAttribute("href"));
    if (nestedKey) {
      return nestedKey;
    }

    const text = root.textContent || "";
    const textMatch = text.match(config.ISSUE_KEY_RE);
    return textMatch ? textMatch[0].toUpperCase() : "";
  }

  function extractIssueKeyFromHref(href) {
    const value = pickText(href);
    if (!value) {
      return "";
    }

    const match = value.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/i);
    return match ? match[1].toUpperCase() : "";
  }

  function extractCardSummary(card) {
    for (const selector of config.SUMMARY_SELECTORS) {
      const match = card.querySelector(selector);
      const text = pickText(match?.textContent);
      if (text && !isIssueKey(text)) {
        return text;
      }
    }

    const lines = (card.textContent || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    return lines.find((line) => !isIssueKey(line)) || "";
  }

  function startCardDateSync() {
    scheduleCardDateRefresh();

    const observer = new MutationObserver((mutations) => {
      if (state.isRefreshingCardDates) {
        return;
      }

      for (const mutation of mutations) {
        if (mutation.type !== "childList" || mutation.addedNodes.length === 0) {
          continue;
        }

        scheduleCardDateRefresh();
        return;
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function scheduleCardDateRefresh() {
    if (state.dateRefreshFrame) {
      return;
    }

    state.dateRefreshFrame = window.requestAnimationFrame(() => {
      state.dateRefreshFrame = 0;
      refreshVisibleCardDates();
    });
  }

  // Jira board cards are rendered and rerendered frequently, so date formatting
  // is applied by rescanning visible cards and rewriting only leaf text nodes
  // whose content still parses as a Jira-style board date.
  function refreshVisibleCardDates() {
    state.isRefreshingCardDates = true;

    try {
      const cards = document.querySelectorAll(config.CARD_SELECTOR);

      for (const card of cards) {
        if (!(card instanceof HTMLElement) || !looksLikeIssueCard(card)) {
          continue;
        }

        refreshCardDates(card);
      }
    } finally {
      state.isRefreshingCardDates = false;
    }
  }

  function refreshCardDates(card) {
    const elements = card.querySelectorAll("*");

    for (const element of elements) {
      if (!(element instanceof HTMLElement) || element.childElementCount > 0) {
        continue;
      }

      formatCardDateElement(element);
    }
  }

  function formatCardDateElement(element) {
    const currentText = pickText(element.textContent);
    const originalText = pickText(element.dataset.jiraEnhanceOriginalDate);
    const sourceText = originalText || currentText;
    const parsedDate = parseCardDateText(sourceText);
    if (!parsedDate) {
      if (!originalText) {
        return;
      }

      delete element.dataset.jiraEnhanceOriginalDate;
      delete element.dataset.jiraEnhanceFormattedDate;
      return;
    }

    if (!originalText) {
      element.dataset.jiraEnhanceOriginalDate = sourceText;
    }

    const formattedDate = formatCardDate(parsedDate, state.cardDateFormat);
    element.dataset.jiraEnhanceFormattedDate = formattedDate;
    if (currentText !== formattedDate) {
      element.textContent = formattedDate;
    }
  }

  // Jira can localize board dates with month names, so parsing accepts the
  // current slash-separated layout and normalizes Chinese and English months
  // into plain year/month/day parts before formatting.
  function parseCardDateText(text) {
    const match = pickText(text).match(CARD_DATE_TEXT_RE);
    if (!match) {
      return null;
    }

    const day = Number(match[1]);
    const month = parseCardMonth(match[2]);
    const year = parseCardYear(match[3]);
    if (!month || !year) {
      return null;
    }

    const date = new Date(year, month - 1, day);
    if (
      !Number.isInteger(day) ||
      day < 1 ||
      day > 31 ||
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    return { day, month, year };
  }

  function parseCardMonth(token) {
    const normalized = pickText(token).toLowerCase().replace(/\./g, "");
    return CARD_MONTH_MAP[normalized] || 0;
  }

  function parseCardYear(token) {
    const value = Number(token);
    if (!Number.isInteger(value)) {
      return 0;
    }

    return token.length === 2 ? 2000 + value : value;
  }

  function formatCardDate(dateParts, format) {
    const replacements = {
      D: String(dateParts.day),
      DD: padDatePart(dateParts.day),
      M: String(dateParts.month),
      MM: padDatePart(dateParts.month),
      YY: String(dateParts.year).slice(-2),
      YYYY: String(dateParts.year)
    };

    return normalizeCardDateFormat(format).replace(/YYYY|YY|MM|M|DD|D/gi, (token) => replacements[token.toUpperCase()]);
  }

  function padDatePart(value) {
    return String(value).padStart(2, "0");
  }

  function positionPopover(card) {
    const popover = ensurePopover();
    const cardRect = card.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const gap = 12;
    const viewportPadding = 12;
    const preferRight = cardRect.right + gap + popoverRect.width <= window.innerWidth - viewportPadding;

    let left = preferRight ? cardRect.right + gap : cardRect.left - popoverRect.width - gap;
    let top = cardRect.top;

    left = clamp(left, viewportPadding, window.innerWidth - popoverRect.width - viewportPadding);
    top = clamp(top, viewportPadding, window.innerHeight - popoverRect.height - viewportPadding);

    popover.style.setProperty("--popover-x", `${Math.round(left)}px`);
    popover.style.setProperty("--popover-y", `${Math.round(top)}px`);
  }

  function isLatestRequest(issueKey, requestId) {
    return requestId === state.currentRequestId && state.activeIssueKey === issueKey;
  }

  function createBodyNode() {
    const body = document.createElement("div");
    body.className = "jira-subtasks-hover-popover__body";
    return body;
  }

  function beginIssueSession(card, issueKey) {
    state.activeCard = card;
    state.activeIssueData = null;
    state.activeIssueKey = issueKey;
    state.blockedByCollapsed = true;
    state.collapsedGroups = new Set();
    state.collapsedGroupsInitialized = false;
    clearEmptyAutoHideTimer();
  }

  function readBodyScrollTop(popover) {
    const body = popover.querySelector(".jira-subtasks-hover-popover__body");
    return body instanceof HTMLElement ? body.scrollTop : 0;
  }

  function shouldUseGhostTone(model, blockedBySection) {
    return Boolean(model.emptyState) && !blockedBySection;
  }

  function syncPopoverTone(popover, useGhostTone) {
    state.isGhostPopover = useGhostTone;
    popover.classList.toggle("jira-subtasks-hover-popover--ghost", useGhostTone);
  }

  function syncEmptyAutoClose(shouldAutoClose) {
    clearEmptyAutoHideTimer();
    if (!shouldAutoClose || state.emptyAutoCloseMs === 0) {
      return;
    }

    state.emptyAutoHideTimer = window.setTimeout(() => {
      if (!state.isGhostPopover) {
        return;
      }

      hidePopover(true);
    }, state.emptyAutoCloseMs);
  }

  function isIssueKey(value) {
    return config.ISSUE_KEY_RE.test(value || "");
  }

  function pickText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeIssueTypeName(value) {
    const rawText = pickText(value);
    if (!rawText) {
      return "";
    }

    const englishMatchedText = rawText.replace(/^(issue type|type)\s*:\s*/i, "");
    const text =
      englishMatchedText !== rawText
        ? englishMatchedText
        : extractIssueTypeValueBySeparator(rawText, ":") || extractIssueTypeValueBySeparator(rawText, "：") || rawText;

    if (!text || isIssueKey(text) || text.length > 32) {
      return "";
    }

    return text;
  }

  function extractIssueTypeValueBySeparator(text, separator) {
    if (!text.includes(separator)) {
      return "";
    }

    return pickText(text.split(separator).pop());
  }

  function normalizeIssueTypeFilters(values) {
    return Array.from(
      new Set(
        (Array.isArray(values) ? values : [])
          .map((value) => normalizeIssueTypeName(value).toLowerCase())
          .filter(Boolean)
      )
    );
  }

  function shouldSkipIssueType(issueTypeName) {
    const normalized = normalizeIssueTypeName(issueTypeName).toLowerCase();
    if (!normalized) {
      return false;
    }

    return state.issueTypeFilters.includes(normalized);
  }

  function normalizeLayoutMode(value) {
    return value === "list" ? "list" : config.DEFAULT_LAYOUT_MODE;
  }

  function openSettingsPage() {
    chrome.runtime.sendMessage({ type: "jira-enhance:open-options-page" }).catch(() => {});
  }

  function clearShowTimer() {
    if (state.showTimer) {
      window.clearTimeout(state.showTimer);
      state.showTimer = 0;
    }
  }

  function clearPressTimer() {
    if (state.pressTimer) {
      window.clearTimeout(state.pressTimer);
      state.pressTimer = 0;
    }
  }

  function clearHideTimer() {
    if (state.hideTimer) {
      window.clearTimeout(state.hideTimer);
      state.hideTimer = 0;
    }
  }

  function clearEmptyAutoHideTimer() {
    if (state.emptyAutoHideTimer) {
      window.clearTimeout(state.emptyAutoHideTimer);
      state.emptyAutoHideTimer = 0;
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function suppressHoverForDrag() {
    clearPressTimer();
    state.suppressHover = true;
    hidePopover(true);
  }
})();
