(() => {
  const JiraEnhance = globalThis.JiraEnhance || (globalThis.JiraEnhance = {});
  const { api, config, presentation, view } = JiraEnhance;

  const state = {
    activeCard: null,
    activeIssueData: null,
    activeIssueKey: "",
    collapsedGroups: new Set(),
    currentRequestId: 0,
    hideTimer: 0,
    hoverCard: null,
    layoutMode: readLayoutMode(),
    menuOpen: false,
    popover: null,
    popoverHovered: false,
    showTimer: 0
  };

  init();

  function init() {
    ensurePopover();
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

    state.activeCard = card;
    state.activeIssueData = null;
    state.activeIssueKey = issue.key;
    state.collapsedGroups = new Set();
    state.menuOpen = false;

    const popover = ensurePopover();
    popover.hidden = false;
    popover.replaceChildren(view.buildHeader(issue.key, "Loading", state.layoutMode, state.menuOpen), view.buildLoadingBody());
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

  // Keep the controller focused on wiring: presentation decides what to show
  // and the view module turns that model into DOM nodes.
  function renderIssue(issueKey, issueData) {
    const popover = ensurePopover();
    const model = presentation.buildPresentationModel(issueData.subtasks, state.layoutMode);
    const body = createBodyNode();

    if (model.emptyState) {
      body.appendChild(view.buildState(model.emptyState.title, model.emptyState.copy));
    } else if (model.layoutMode === "grouped") {
      body.appendChild(view.buildGroupedContent(issueKey, model.groups, state.collapsedGroups));
    } else {
      body.appendChild(view.buildFlatList(model.items));
    }

    popover.replaceChildren(view.buildHeader(issueKey, model.metric, state.layoutMode, state.menuOpen), body);
    if (state.activeCard) {
      positionPopover(state.activeCard);
    }
  }

  function renderError(issueKey, error) {
    const popover = ensurePopover();
    const message = error instanceof Error ? error.message : "Unknown error";
    const body = createBodyNode();

    body.appendChild(view.buildState("Could not load subtasks", `Jira returned an error while loading this issue: ${message}`));
    popover.replaceChildren(view.buildHeader(issueKey, "Unavailable", state.layoutMode, state.menuOpen), body);

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

    clearHideTimer();
    setMenuOpen(false);
    state.activeCard = null;
    state.activeIssueData = null;
    state.activeIssueKey = "";
    state.collapsedGroups = new Set();
    state.currentRequestId += 1;
    state.hoverCard = null;
    state.menuOpen = false;
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

    const toggleMenu = target.closest('[data-action="toggle-menu"]');
    if (toggleMenu) {
      event.preventDefault();
      event.stopPropagation();
      setMenuOpen(!state.menuOpen);
      return;
    }

    const toggleLayout = target.closest('[data-action="toggle-layout"]');
    if (toggleLayout) {
      event.preventDefault();
      event.stopPropagation();
      state.layoutMode = state.layoutMode === "grouped" ? "list" : "grouped";
      state.menuOpen = false;
      writeLayoutMode(state.layoutMode);

      if (state.activeIssueKey && state.activeIssueData) {
        renderIssue(state.activeIssueKey, state.activeIssueData);
      }
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

    if (state.menuOpen && !target.closest(".jira-subtasks-hover-popover__menu")) {
      setMenuOpen(false);
    }
  }

  function setMenuOpen(nextOpen) {
    state.menuOpen = nextOpen;

    if (!state.popover) {
      return;
    }

    const menu = state.popover.querySelector(".jira-subtasks-hover-popover__menu");
    const button = state.popover.querySelector('[data-action="toggle-menu"]');
    if (menu) {
      menu.classList.toggle("jira-subtasks-hover-popover__menu--open", nextOpen);
    }

    if (button) {
      button.setAttribute("aria-expanded", String(nextOpen));
    }
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
    return {
      key: extractIssueKey(card),
      summary: extractCardSummary(card)
    };
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

  function isIssueKey(value) {
    return config.ISSUE_KEY_RE.test(value || "");
  }

  function pickText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function readLayoutMode() {
    try {
      return window.localStorage.getItem(config.LAYOUT_MODE_STORAGE_KEY) === "list" ? "list" : "grouped";
    } catch {
      return "grouped";
    }
  }

  function writeLayoutMode(layoutMode) {
    try {
      window.localStorage.setItem(config.LAYOUT_MODE_STORAGE_KEY, layoutMode);
    } catch {}
  }

  function clearShowTimer() {
    if (state.showTimer) {
      window.clearTimeout(state.showTimer);
      state.showTimer = 0;
    }
  }

  function clearHideTimer() {
    if (state.hideTimer) {
      window.clearTimeout(state.hideTimer);
      state.hideTimer = 0;
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
})();
