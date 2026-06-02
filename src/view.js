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

  function createSvgElement(tagName, attributes = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);

    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }

    return element;
  }

  function buildHeader(issueKey, metric) {
    const header = createElement("header", "jira-subtasks-hover-popover__header");
    const keyRow = createElement("div", "jira-subtasks-hover-popover__key-row");
    const actions = createElement("div", "jira-subtasks-hover-popover__header-actions");
    const key = createElement("a", "jira-subtasks-hover-popover__issue-key", issueKey);
    const progress = buildHeaderMetric(metric);
    const settingsButton = buildSettingsButton();

    key.href = `/browse/${encodeURIComponent(issueKey)}`;
    key.target = "_blank";
    key.rel = "noreferrer";
    key.title = `Open ${issueKey} in a new tab`;

    actions.append(progress, settingsButton);
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

  function buildSettingsButton() {
    const button = createElement("button", "jira-subtasks-hover-popover__settings-trigger");
    const icon = createSvgElement("svg", {
      "aria-hidden": "true",
      class: "jira-subtasks-hover-popover__settings-icon",
      viewBox: "0 0 1024 1024"
    });
    const path = createSvgElement("path", {
      d: "M640 288a64 64 0 1 1 0.032-128.032A64 64 0 0 1 640 288z m123.456-96c-14.304-55.04-64-96-123.456-96s-109.152 40.96-123.456 96H128v64h388.544c14.304 55.04 64 96 123.456 96s109.152-40.96 123.456-96H896V192h-132.544zM640 864a64 64 0 1 1 0.032-128.032A64 64 0 0 1 640 864m0-192c-59.456 0-109.152 40.96-123.456 96H128v64h388.544c14.304 55.04 64 96 123.456 96s109.152-40.96 123.456-96H896v-64h-132.544c-14.304-55.04-64-96-123.456-96M384 576a64 64 0 1 1 0.032-128.032A64 64 0 0 1 384 576m0-192c-59.456 0-109.152 40.96-123.456 96H128v64h132.544c14.304 55.04 64 96 123.456 96s109.152-40.96 123.456-96H896v-64H507.456c-14.304-55.04-64-96-123.456-96",
      fill: "currentColor"
    });

    button.type = "button";
    button.dataset.action = "open-settings";
    button.title = "Settings";

    icon.appendChild(path);
    button.appendChild(icon);
    return button;
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
      list.appendChild(buildIssueItem(subtask, { showAssignee: true }));
    }

    return list;
  }

  function buildIssueMetric(issues) {
    return issues.reduce(
      (metric, issue) => {
        if (status.isCancelledStatus(issue)) {
          return metric;
        }

        metric.total += 1;
        if (status.isDoneStatus(issue)) {
          metric.completed += 1;
        }

        return metric;
      },
      { completed: 0, total: 0 }
    );
  }

  function buildBlockedBySection(issues, isCollapsed) {
    if (!Array.isArray(issues) || !issues.length) {
      return null;
    }

    const metric = buildIssueMetric(issues);
    const section = createElement("section", "jira-subtasks-hover-popover__linked-section");
    const heading = createElement("button", "jira-subtasks-hover-popover__linked-heading");
    const label = createElement("div", "jira-subtasks-hover-popover__linked-label", "BLOCKED BY BUGS");
    const meta = createElement("div", "jira-subtasks-hover-popover__linked-meta", `${metric.completed}/${metric.total}`);
    const list = createElement("ul", "jira-subtasks-hover-popover__list");

    heading.type = "button";
    heading.dataset.action = "toggle-blocked-by";
    heading.setAttribute("aria-expanded", String(!isCollapsed));
    heading.title = isCollapsed ? "Expand blocked bugs" : "Collapse blocked bugs";
    label.title = "Blocked By Bugs";
    meta.title = `${metric.completed} of ${metric.total} blocked bugs done`;

    section.classList.toggle("jira-subtasks-hover-popover__linked-section--collapsed", isCollapsed);

    for (const issue of issues) {
      list.appendChild(buildIssueItem(issue, { showAssignee: false }));
    }

    heading.append(label, meta);
    section.append(heading, list);
    return section;
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
    const count = createElement(
      "div",
      "jira-subtasks-hover-popover__group-count",
      `${group.metric.completed}/${group.metric.total}`
    );
    const list = createElement("ul", "jira-subtasks-hover-popover__list");
    const groupKey = presentation.buildGroupStateKey(issueKey, group.assigneeName);
    const isCollapsed = collapsedGroups.has(groupKey);

    heading.type = "button";
    heading.dataset.action = "toggle-group";
    heading.dataset.groupKey = groupKey;
    heading.setAttribute("aria-expanded", String(!isCollapsed));
    heading.title = isCollapsed ? "Expand subtasks" : "Collapse subtasks";

    assignee.title = group.assigneeName;
    count.title = `${group.metric.completed} of ${group.metric.total} subtasks done`;

    section.classList.toggle("jira-subtasks-hover-popover__group--cancelled-only", group.isCancelledOnly);
    section.classList.toggle("jira-subtasks-hover-popover__group--collapsed", isCollapsed);
    heading.append(assignee, count);

    for (const subtask of group.items) {
      list.appendChild(buildIssueItem(subtask, { showAssignee: false }));
    }

    section.append(heading, list);
    return section;
  }

  function buildIssueItem(issue, options) {
    const { showAssignee } = options;
    const item = createElement("li", "jira-subtasks-hover-popover__item");
    const link = createElement("a", "jira-subtasks-hover-popover__item-link");
    const row = createElement("div", "jira-subtasks-hover-popover__item-row");
    const main = createElement("div", "jira-subtasks-hover-popover__item-main");
    const isCancelled = status.isCancelledStatus(issue);
    const statusDot = createElement(
      "span",
      `jira-subtasks-hover-popover__status-dot jira-subtasks-hover-popover__status-dot--${status.mapStatusTone(
        issue.statusName,
        issue.statusColor
      )}`
    );
    const key = createElement("div", "jira-subtasks-hover-popover__item-key", issue.key);
    const title = createElement("div", "jira-subtasks-hover-popover__item-title", issue.summary);

    link.href = `/browse/${encodeURIComponent(issue.key)}`;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.title = `${issue.key}  ${issue.summary}`;
    statusDot.title = issue.statusName;
    key.title = issue.key;
    title.title = issue.summary;

    row.classList.toggle("jira-subtasks-hover-popover__item-row--compact", !showAssignee);
    link.classList.toggle("jira-subtasks-hover-popover__item-link--cancelled", isCancelled);

    main.append(statusDot, key);
    main.appendChild(title);
    if (showAssignee) {
      const assignee = createElement("div", "jira-subtasks-hover-popover__assignee", issue.assigneeName);
      assignee.title = issue.assigneeName;
      row.append(main, assignee);
    } else {
      row.appendChild(main);
    }

    link.appendChild(row);
    item.appendChild(link);
    return item;
  }

  JiraEnhance.view = {
    buildBlockedBySection,
    buildFlatList,
    buildGroupedContent,
    buildHeader,
    buildLoadingBody,
    buildState
  };
})();
