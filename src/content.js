(() => {
  const SHOW_DELAY_MS = 180;
  const HIDE_DELAY_MS = 200;
  const CACHE_TTL_MS = 60_000;
  const LAYOUT_MODE_STORAGE_KEY = "jira-subtasks-hover:layout-mode";
  const ISSUE_KEY_RE = /\b[A-Z][A-Z0-9_]+-\d+\b/;
  const CARD_SELECTOR = [
    "[data-issue-key]",
    ".ghx-issue",
    '[data-testid*="board.card"]',
    '[data-testid*="card.card"]',
    '[data-component-selector*="card.card"]'
  ].join(",");

  const issueCache = new Map();
  const state = {
    activeCard: null,
    collapsedGroups: new Set(),
    activeIssueData: null,
    activeIssueKey: "",
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
    }, SHOW_DELAY_MS);
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

  function scheduleHide() {
    clearHideTimer();
    state.hideTimer = window.setTimeout(() => {
      if (state.hoverCard || state.popoverHovered) {
        return;
      }

      hidePopover(true);
    }, HIDE_DELAY_MS);
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

  // Render a lightweight loading shell first so the popover appears immediately
  // and then swap in the Jira response once the request finishes.
  async function showPopover(card, issue) {
    if (!card.isConnected) {
      return;
    }

    state.activeCard = card;
    state.activeIssueData = null;
    state.activeIssueKey = issue.key;
    state.collapsedGroups = new Set();
    state.menuOpen = false;
    renderLoading(issue);
    state.popover.hidden = false;
    positionPopover(card);

    const requestId = ++state.currentRequestId;

    try {
      const data = await fetchIssueData(issue.key);
      if (requestId !== state.currentRequestId || state.activeIssueKey !== issue.key) {
        return;
      }

      state.activeIssueData = data;
      renderIssue(issue, data);
      positionPopover(card);
    } catch (error) {
      if (requestId !== state.currentRequestId || state.activeIssueKey !== issue.key) {
        return;
      }

      state.activeIssueData = null;
      renderError(issue, error);
      positionPopover(card);
    }
  }

  // Jira boards can re-render aggressively while hovering, so a short-lived cache
  // keeps the UI responsive and avoids refetching the same issue over and over.
  async function fetchIssueData(issueKey) {
    const cached = issueCache.get(issueKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const response = await fetch(
      `/rest/api/2/issue/${encodeURIComponent(issueKey)}?fields=summary,subtasks`,
      {
        credentials: "include",
        headers: {
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const payload = await response.json();
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
      expiresAt: Date.now() + CACHE_TTL_MS
    });

    return data;
  }

  async function fetchSubtaskFields(issueKeys) {
    if (!issueKeys.length) {
      return new Map();
    }

    const jql = `issueKey in (${issueKeys.map((key) => `"${key}"`).join(",")})`;
    const response = await fetch(
      `/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=summary,status,assignee&maxResults=${issueKeys.length}`,
      {
        credentials: "include",
        headers: {
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Subtask request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const fieldsByKey = new Map();

    for (const issue of payload.issues || []) {
      if (issue?.key) {
        fieldsByKey.set(issue.key, issue.fields || {});
      }
    }

    return fieldsByKey;
  }

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

  function renderLoading(issue) {
    const popover = ensurePopover();
    const header = buildHeader(issue.key, "Loading");
    const body = createElement("div", "jira-subtasks-hover-popover__state");
    const copy = createElement(
      "div",
      "jira-subtasks-hover-popover__state-copy",
      "Fetching the latest subtasks from Jira."
    );
    const loadingBar = createElement("div", "jira-subtasks-hover-popover__loading-bar");

    body.append(copy, loadingBar);
    popover.replaceChildren(header, body);
  }

  function renderIssue(issue, data) {
    const popover = ensurePopover();
    const header = buildHeader(issue.key, {
      completed: countCompletedSubtasks(data.subtasks),
      total: data.subtasks.length
    });
    const body = createElement("div", "jira-subtasks-hover-popover__body");

    if (!data.subtasks.length) {
      const emptyState = buildState(
        "No subtasks",
        "This issue does not have any subtasks yet."
      );
      body.appendChild(emptyState);
      popover.replaceChildren(header, body);
      return;
    }

    if (state.layoutMode === "grouped") {
      const groupedContent = buildGroupedSubtaskContent(data.subtasks);
      if (!groupedContent) {
        body.appendChild(
          buildState("No active assignee groups", "All assignee groups only contain cancelled subtasks.")
        );
        popover.replaceChildren(header, body);
        return;
      }

      body.appendChild(groupedContent);
    } else {
      body.appendChild(buildFlatSubtaskList(data.subtasks));
    }

    popover.replaceChildren(header, body);
  }

  function renderError(issue, error) {
    const popover = ensurePopover();
    const message = error instanceof Error ? error.message : "Unknown error";
    const header = buildHeader(issue.key, "Unavailable");
    const body = buildState(
      "Could not load subtasks",
      `Jira returned an error while loading this issue: ${message}`
    );

    popover.replaceChildren(header, body);
  }

  function buildHeader(issueKey, countLabel) {
    const header = createElement("header", "jira-subtasks-hover-popover__header");
    const keyRow = createElement("div", "jira-subtasks-hover-popover__key-row");
    const actions = createElement("div", "jira-subtasks-hover-popover__header-actions");
    const key = createElement("div", "jira-subtasks-hover-popover__issue-key", issueKey);
    const count = buildHeaderMetric(countLabel);
    const menu = buildLayoutMenu();

    actions.append(count, menu);
    keyRow.append(key, actions);
    header.append(keyRow);
    return header;
  }

  function buildHeaderMetric(metric) {
    if (typeof metric === "string") {
      return createElement("div", "jira-subtasks-hover-popover__count", metric);
    }

    const progress = createElement("div", "jira-subtasks-hover-popover__progress");
    const ratio = createElement(
      "div",
      "jira-subtasks-hover-popover__progress-ratio",
      `${metric.completed}/${metric.total}`
    );
    const ring = createElement("span", "jira-subtasks-hover-popover__progress-ring");
    const percentage = metric.total > 0 ? (metric.completed / metric.total) * 100 : 0;

    ring.style.setProperty("--progress", `${Math.max(0, Math.min(100, percentage))}%`);
    ring.title = `${metric.completed} of ${metric.total} done`;
    progress.title = `${metric.completed} of ${metric.total} subtasks done`;

    progress.append(ratio, ring);
    return progress;
  }

  function buildLayoutMenu() {
    const menu = createElement("div", "jira-subtasks-hover-popover__menu");
    const button = createElement("button", "jira-subtasks-hover-popover__menu-trigger");
    const dots = createElement("span", "jira-subtasks-hover-popover__menu-dots");
    const panel = createElement("div", "jira-subtasks-hover-popover__menu-panel");
    const item = createElement("button", "jira-subtasks-hover-popover__menu-item");
    const icon = createElement(
      "span",
      `jira-subtasks-hover-popover__menu-item-icon jira-subtasks-hover-popover__menu-item-icon--${
        state.layoutMode === "grouped" ? "list" : "grouped"
      }`
    );
    const label = createElement(
      "span",
      "jira-subtasks-hover-popover__menu-item-label",
      state.layoutMode === "grouped" ? "List" : "Group"
    );

    button.type = "button";
    button.dataset.action = "toggle-menu";
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", String(state.menuOpen));
    button.title = "More";

    item.type = "button";
    item.dataset.action = "toggle-layout";
    item.title = state.layoutMode === "grouped" ? "Switch to list layout" : "Switch to grouped layout";
    icon.setAttribute("aria-hidden", "true");

    for (let index = 0; index < 3; index += 1) {
      dots.appendChild(createElement("span", "jira-subtasks-hover-popover__menu-dot"));
    }

    if (state.menuOpen) {
      menu.classList.add("jira-subtasks-hover-popover__menu--open");
    }

    item.append(icon, label);
    panel.appendChild(item);
    button.appendChild(dots);
    menu.append(button, panel);
    return menu;
  }

  function buildState(title, copy) {
    const stateElement = createElement("div", "jira-subtasks-hover-popover__state");
    const stateTitle = createElement("div", "jira-subtasks-hover-popover__state-title", title);
    const stateCopy = createElement("div", "jira-subtasks-hover-popover__state-copy", copy);

    stateElement.append(stateTitle, stateCopy);
    return stateElement;
  }

  // Group subtasks by assignee so the popover is easier to scan when one person
  // owns several items. "Unassigned" is pushed to the end on purpose.
  function groupSubtasksByAssignee(subtasks) {
    const groups = new Map();

    for (const subtask of subtasks) {
      const assigneeName = pickText(subtask.assigneeName) || "Unassigned";
      if (!groups.has(assigneeName)) {
        groups.set(assigneeName, []);
      }

      groups.get(assigneeName).push(subtask);
    }

    return Array.from(groups.entries())
      .sort(compareAssigneeGroups)
      .map(([assigneeName, items]) => ({
        assigneeName,
        items: items.sort(compareSubtasks)
      }));
  }

  function buildGroupedSubtaskContent(subtasks) {
    const visibleGroups = getVisibleAssigneeGroups(subtasks);
    if (!visibleGroups.length) {
      return null;
    }

    const groups = createElement("div", "jira-subtasks-hover-popover__groups");

    for (const group of visibleGroups) {
      groups.appendChild(buildAssigneeGroup(group));
    }

    return groups;
  }

  function getVisibleAssigneeGroups(subtasks) {
    return groupSubtasksByAssignee(subtasks).filter(
      (group) => !group.items.every((subtask) => classifyStatus(subtask.statusName, subtask.statusColor) === "cancelled")
    );
  }

  function buildFlatSubtaskList(subtasks) {
    const list = createElement("ul", "jira-subtasks-hover-popover__list");

    for (const subtask of subtasks.slice().sort(compareSubtasksForList)) {
      list.appendChild(buildSubtaskItem(subtask));
    }

    return list;
  }

  function countCompletedSubtasks(subtasks) {
    let completed = 0;

    for (const subtask of subtasks) {
      if (mapStatusTone(subtask.statusName, subtask.statusColor) === "green") {
        completed += 1;
      }
    }

    return completed;
  }

  function compareAssigneeGroups([leftName], [rightName]) {
    const leftUnassigned = leftName === "Unassigned";
    const rightUnassigned = rightName === "Unassigned";

    if (leftUnassigned && !rightUnassigned) {
      return 1;
    }

    if (!leftUnassigned && rightUnassigned) {
      return -1;
    }

    return leftName.localeCompare(rightName, undefined, {
      sensitivity: "base"
    });
  }

  function compareSubtasks(left, right) {
    return left.key.localeCompare(right.key, undefined, {
      numeric: true,
      sensitivity: "base"
    });
  }

  function compareSubtasksForList(left, right) {
    const leftRank = getStatusRank(left.statusName, left.statusColor);
    const rightRank = getStatusRank(right.statusName, right.statusColor);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return compareSubtasks(left, right);
  }

  function buildAssigneeGroup(group) {
    const section = createElement("section", "jira-subtasks-hover-popover__group");
    const heading = createElement("button", "jira-subtasks-hover-popover__group-heading");
    const assignee = createElement("div", "jira-subtasks-hover-popover__group-assignee", group.assigneeName);
    const count = createElement("div", "jira-subtasks-hover-popover__group-count", `${group.items.length}`);
    const list = createElement("ul", "jira-subtasks-hover-popover__list");
    const groupKey = buildGroupStateKey(group.assigneeName);
    const isCollapsed = state.collapsedGroups.has(groupKey);

    heading.type = "button";
    heading.dataset.action = "toggle-group";
    heading.dataset.groupKey = groupKey;
    heading.setAttribute("aria-expanded", String(!isCollapsed));
    heading.title = isCollapsed ? "Expand subtasks" : "Collapse subtasks";

    assignee.title = group.assigneeName;
    count.title = `${group.items.length} subtasks`;

    section.classList.toggle("jira-subtasks-hover-popover__group--collapsed", isCollapsed);
    heading.append(assignee, count);

    for (const subtask of group.items) {
      list.appendChild(buildSubtaskItem(subtask, { showAssignee: false }));
    }

    section.append(heading, list);
    return section;
  }

  function buildGroupStateKey(assigneeName) {
    return `${state.activeIssueKey}::${assigneeName}`;
  }

  // Toggle between grouped and flat rendering without refetching data so the
  // popover stays responsive while the user is comparing both layouts.
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

      if (!state.activeIssueKey || !state.activeIssueData) {
        return;
      }

      renderIssue({ key: state.activeIssueKey }, state.activeIssueData);
      if (state.activeCard) {
        positionPopover(state.activeCard);
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

      if (!state.activeIssueKey || !state.activeIssueData) {
        return;
      }

      renderIssue({ key: state.activeIssueKey }, state.activeIssueData);
      if (state.activeCard) {
        positionPopover(state.activeCard);
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

  function buildSubtaskItem(subtask, options = {}) {
    const { showAssignee = true } = options;
    const item = createElement("li", "jira-subtasks-hover-popover__item");
    const link = createElement("a", "jira-subtasks-hover-popover__item-link");
    const row = createElement("div", "jira-subtasks-hover-popover__item-row");
    const main = createElement("div", "jira-subtasks-hover-popover__item-main");
    const statusKind = classifyStatus(subtask.statusName, subtask.statusColor);
    const statusDot = createElement(
      "span",
      `jira-subtasks-hover-popover__status-dot jira-subtasks-hover-popover__status-dot--${mapStatusTone(
        subtask.statusName,
        subtask.statusColor
      )}`
    );
    const key = createElement("div", "jira-subtasks-hover-popover__item-key", subtask.key);
    const title = createElement("div", "jira-subtasks-hover-popover__item-title", subtask.summary);
    const assignee = createElement("div", "jira-subtasks-hover-popover__assignee", subtask.assigneeName);
    const isCancelled = statusKind === "cancelled";

    link.href = `/browse/${encodeURIComponent(subtask.key)}`;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.title = `${subtask.key}  ${subtask.summary}`;
    statusDot.title = subtask.statusName;
    key.title = subtask.key;
    title.title = subtask.summary;
    assignee.title = subtask.assigneeName;
    row.classList.toggle("jira-subtasks-hover-popover__item-row--compact", !showAssignee);
    item.classList.toggle("jira-subtasks-hover-popover__item--cancelled", isCancelled);
    link.classList.toggle("jira-subtasks-hover-popover__item-link--cancelled", isCancelled);

    main.append(statusDot, key, title);

    if (showAssignee) {
      row.append(main, assignee);
    } else {
      row.appendChild(main);
    }

    link.append(row);
    item.appendChild(link);
    return item;
  }

  function positionPopover(card) {
    const popover = ensurePopover();
    const cardRect = card.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const gap = 12;
    const viewportPadding = 12;
    const preferRight = cardRect.right + gap + popoverRect.width <= window.innerWidth - viewportPadding;

    let left = preferRight
      ? cardRect.right + gap
      : cardRect.left - popoverRect.width - gap;
    let top = cardRect.top;

    left = clamp(left, viewportPadding, window.innerWidth - popoverRect.width - viewportPadding);
    top = clamp(top, viewportPadding, window.innerHeight - popoverRect.height - viewportPadding);

    popover.style.setProperty("--popover-x", `${Math.round(left)}px`);
    popover.style.setProperty("--popover-y", `${Math.round(top)}px`);
  }

  // Jira's board markup differs between Cloud and older board implementations,
  // so we climb the DOM and stop at the first ancestor that looks like an issue card.
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

  function looksLikeIssueCard(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (!extractIssueKey(element)) {
      return false;
    }

    if (element.matches(CARD_SELECTOR)) {
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

  // Prefer stable attributes and browse links before falling back to text matching.
  function extractIssueKey(root) {
    if (!(root instanceof Element)) {
      return "";
    }

    const attributes = ["data-issue-key", "data-key", "issue-key"];
    for (const attribute of attributes) {
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
    const textMatch = text.match(ISSUE_KEY_RE);
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

  // Different Jira card variants expose the summary in different nodes,
  // so try a few likely selectors before falling back to plain text lines.
  function extractCardSummary(card) {
    const summarySelectors = [
      '[data-testid*="summary"]',
      '[data-component-selector*="summary"]',
      '[role="heading"]'
    ];

    for (const selector of summarySelectors) {
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

  function isIssueKey(value) {
    return ISSUE_KEY_RE.test(value || "");
  }

  function pickText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function readLayoutMode() {
    try {
      return window.localStorage.getItem(LAYOUT_MODE_STORAGE_KEY) === "list" ? "list" : "grouped";
    } catch {
      return "grouped";
    }
  }

  function writeLayoutMode(layoutMode) {
    try {
      window.localStorage.setItem(LAYOUT_MODE_STORAGE_KEY, layoutMode);
    } catch {}
  }

  function createElement(tagName, className, textContent) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }

    if (textContent) {
      element.textContent = textContent;
    }

    return element;
  }

  // Prefer explicit status names first so board-specific workflows can still map
  // to a small set of consistent visual states in the popover.
  function mapStatusTone(statusName, colorName) {
    const statusKind = classifyStatus(statusName, colorName);

    switch (statusKind) {
      case "cancelled":
        return "grey";
      case "done":
        return "green";
      case "todo":
        return "yellow";
      default:
        return "blue";
    }
  }

  function getStatusRank(statusName, colorName) {
    const statusKind = classifyStatus(statusName, colorName);

    switch (statusKind) {
      case "todo":
        return 0;
      case "in_progress":
        return 1;
      case "done":
        return 2;
      case "cancelled":
        return 3;
      default:
        return 4;
    }
  }

  function classifyStatus(statusName, colorName) {
    const normalizedName = (statusName || "").trim().toLowerCase();
    const normalizedColor = (colorName || "").trim().toLowerCase();

    if (
      normalizedName.includes("cancel") ||
      normalizedName.includes("canceled") ||
      normalizedName.includes("cancelled") ||
      normalizedName.includes("aborted") ||
      normalizedName.includes("wontfix") ||
      normalizedName.includes("won't fix") ||
      normalizedName.includes("关闭") ||
      normalizedName.includes("取消")
    ) {
      return "cancelled";
    }

    if (
      normalizedName.includes("done") ||
      normalizedName.includes("complete") ||
      normalizedName.includes("completed") ||
      normalizedName.includes("resolved") ||
      normalizedName.includes("finished") ||
      normalizedName.includes("完成") ||
      normalizedName.includes("已完成") ||
      normalizedName.includes("解决")
    ) {
      return "done";
    }

    if (
      normalizedName.includes("todo") ||
      normalizedName.includes("to do") ||
      normalizedName.includes("backlog") ||
      normalizedName.includes("open") ||
      normalizedName.includes("new") ||
      normalizedName.includes("ready") ||
      normalizedName.includes("pending") ||
      normalizedName.includes("queued") ||
      normalizedName.includes("planned") ||
      normalizedName.includes("待处理") ||
      normalizedName.includes("待办") ||
      normalizedName.includes("未开始") ||
      normalizedName.includes("未启动") ||
      normalizedName.includes("待开始")
    ) {
      return "todo";
    }

    if (
      normalizedName.includes("progress") ||
      normalizedName.includes("doing") ||
      normalizedName.includes("active") ||
      normalizedName.includes("review") ||
      normalizedName.includes("testing") ||
      normalizedName.includes("develop") ||
      normalizedName.includes("qa") ||
      normalizedName.includes("进行中") ||
      normalizedName.includes("处理中") ||
      normalizedName.includes("开发中") ||
      normalizedName.includes("测试中") ||
      normalizedName.includes("评审中")
    ) {
      return "in_progress";
    }

    if (normalizedColor === "green") {
      return "done";
    }

    if (normalizedColor === "medium-gray" || normalizedColor === "blue-gray" || normalizedColor === "gray") {
      return "todo";
    }

    if (normalizedColor === "yellow" || normalizedColor === "blue") {
      return "in_progress";
    }

    return "in_progress";
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
