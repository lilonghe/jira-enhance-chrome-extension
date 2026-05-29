(() => {
  const JiraEnhance = globalThis.JiraEnhance || (globalThis.JiraEnhance = {});

  const STATUS_KEYWORDS = Object.freeze({
    cancelled: [
      "cancel",
      "canceled",
      "cancelled",
      "aborted",
      "wontfix",
      "won't fix",
      "关闭",
      "取消"
    ],
    done: [
      "done",
      "complete",
      "completed",
      "resolved",
      "finished",
      "完成",
      "已完成",
      "解决"
    ],
    todo: [
      "todo",
      "to do",
      "backlog",
      "open",
      "new",
      "ready",
      "pending",
      "queued",
      "planned",
      "待处理",
      "待办",
      "未开始",
      "未启动",
      "待开始"
    ],
    inProgress: [
      "progress",
      "doing",
      "active",
      "review",
      "testing",
      "develop",
      "qa",
      "进行中",
      "处理中",
      "开发中",
      "测试中",
      "评审中"
    ]
  });

  function containsAny(text, keywords) {
    return keywords.some((keyword) => text.includes(keyword));
  }

  // Jira status names vary a lot across teams, so we normalize both the label
  // and Jira's category color into the small set of UI states we care about.
  function classifyStatus(statusName, colorName) {
    const normalizedName = (statusName || "").trim().toLowerCase();
    const normalizedColor = (colorName || "").trim().toLowerCase();

    if (containsAny(normalizedName, STATUS_KEYWORDS.cancelled)) {
      return "cancelled";
    }

    if (containsAny(normalizedName, STATUS_KEYWORDS.done)) {
      return "done";
    }

    if (containsAny(normalizedName, STATUS_KEYWORDS.todo)) {
      return "todo";
    }

    if (containsAny(normalizedName, STATUS_KEYWORDS.inProgress)) {
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

  function mapStatusTone(statusName, colorName) {
    switch (classifyStatus(statusName, colorName)) {
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
    switch (classifyStatus(statusName, colorName)) {
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

  function isCancelledStatus(subtask) {
    return classifyStatus(subtask.statusName, subtask.statusColor) === "cancelled";
  }

  function isDoneStatus(subtask) {
    return classifyStatus(subtask.statusName, subtask.statusColor) === "done";
  }

  JiraEnhance.status = {
    classifyStatus,
    getStatusRank,
    isCancelledStatus,
    isDoneStatus,
    mapStatusTone
  };
})();
