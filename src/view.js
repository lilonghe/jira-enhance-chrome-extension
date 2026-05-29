(() => {
  const JiraEnhance = globalThis.JiraEnhance || (globalThis.JiraEnhance = {});
  const { presentation, status } = JiraEnhance;

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

  function buildHeader(issueKey, metric, layoutMode, menuOpen) {
    const header = createElement("header", "jira-subtasks-hover-popover__header");
    const keyRow = createElement("div", "jira-subtasks-hover-popover__key-row");
    const actions = createElement("div", "jira-subtasks-hover-popover__header-actions");
    const key = createElement("div", "jira-subtasks-hover-popover__issue-key", issueKey);
    const progress = buildHeaderMetric(metric);
    const menu = buildLayoutMenu(layoutMode, menuOpen);

    actions.append(progress, menu);
    keyRow.append(key, actions);
    header.appendChild(keyRow);
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

  function buildLayoutMenu(layoutMode, menuOpen) {
    const menu = createElement("div", "jira-subtasks-hover-popover__menu");
    const button = createElement("button", "jira-subtasks-hover-popover__menu-trigger");
    const dots = createElement("span", "jira-subtasks-hover-popover__menu-dots");
    const panel = createElement("div", "jira-subtasks-hover-popover__menu-panel");
    const item = createElement("button", "jira-subtasks-hover-popover__menu-item");
    const icon = createElement(
      "span",
      `jira-subtasks-hover-popover__menu-item-icon jira-subtasks-hover-popover__menu-item-icon--${
        layoutMode === "grouped" ? "list" : "grouped"
      }`
    );
    const label = createElement(
      "span",
      "jira-subtasks-hover-popover__menu-item-label",
      layoutMode === "grouped" ? "List" : "Group"
    );

    button.type = "button";
    button.dataset.action = "toggle-menu";
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", String(menuOpen));
    button.title = "More";

    item.type = "button";
    item.dataset.action = "toggle-layout";
    item.title = layoutMode === "grouped" ? "Switch to list layout" : "Switch to grouped layout";
    icon.setAttribute("aria-hidden", "true");

    for (let index = 0; index < 3; index += 1) {
      dots.appendChild(createElement("span", "jira-subtasks-hover-popover__menu-dot"));
    }

    if (menuOpen) {
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

  function buildLoadingBody() {
    const body = createElement("div", "jira-subtasks-hover-popover__state");
    const copy = createElement(
      "div",
      "jira-subtasks-hover-popover__state-copy",
      "Fetching the latest subtasks from Jira."
    );
    const loadingBar = createElement("div", "jira-subtasks-hover-popover__loading-bar");

    body.append(copy, loadingBar);
    return body;
  }

  function buildFlatList(items) {
    const list = createElement("ul", "jira-subtasks-hover-popover__list");

    for (const subtask of items) {
      list.appendChild(buildSubtaskItem(subtask, { showAssignee: true }));
    }

    return list;
  }

  function buildGroupedContent(issueKey, groups, collapsedGroups) {
    const container = createElement("div", "jira-subtasks-hover-popover__groups");

    for (const group of groups) {
      container.appendChild(buildAssigneeGroup(issueKey, group, collapsedGroups));
    }

    return container;
  }

  // Group headers stay intentionally minimal in the UI, so the clickable row
  // itself carries the collapse state and count instead of extra chrome.
  function buildAssigneeGroup(issueKey, group, collapsedGroups) {
    const section = createElement("section", "jira-subtasks-hover-popover__group");
    const heading = createElement("button", "jira-subtasks-hover-popover__group-heading");
    const assignee = createElement("div", "jira-subtasks-hover-popover__group-assignee", group.assigneeName);
    const count = createElement("div", "jira-subtasks-hover-popover__group-count", `${group.items.length}`);
    const list = createElement("ul", "jira-subtasks-hover-popover__list");
    const groupKey = presentation.buildGroupStateKey(issueKey, group.assigneeName);
    const isCollapsed = collapsedGroups.has(groupKey);

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

  function buildSubtaskItem(subtask, options) {
    const { showAssignee } = options;
    const item = createElement("li", "jira-subtasks-hover-popover__item");
    const link = createElement("a", "jira-subtasks-hover-popover__item-link");
    const row = createElement("div", "jira-subtasks-hover-popover__item-row");
    const main = createElement("div", "jira-subtasks-hover-popover__item-main");
    const statusKind = status.classifyStatus(subtask.statusName, subtask.statusColor);
    const statusDot = createElement(
      "span",
      `jira-subtasks-hover-popover__status-dot jira-subtasks-hover-popover__status-dot--${status.mapStatusTone(
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
    link.classList.toggle("jira-subtasks-hover-popover__item-link--cancelled", isCancelled);

    main.append(statusDot, key, title);
    if (showAssignee) {
      row.append(main, assignee);
    } else {
      row.appendChild(main);
    }

    link.appendChild(row);
    item.appendChild(link);
    return item;
  }

  JiraEnhance.view = {
    buildFlatList,
    buildGroupedContent,
    buildHeader,
    buildLoadingBody,
    buildState
  };
})();
