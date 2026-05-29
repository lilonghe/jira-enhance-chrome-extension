(() => {
  const JiraEnhance = globalThis.JiraEnhance || (globalThis.JiraEnhance = {});
  const { status } = JiraEnhance;

  function compareSubtasksByKey(left, right) {
    return left.key.localeCompare(right.key, undefined, {
      numeric: true,
      sensitivity: "base"
    });
  }

  function compareSubtasksForList(left, right) {
    const leftRank = status.getStatusRank(left.statusName, left.statusColor);
    const rightRank = status.getStatusRank(right.statusName, right.statusColor);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return compareSubtasksByKey(left, right);
  }

  function compareAssigneeNames(leftName, rightName) {
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

  function groupSubtasksByAssignee(subtasks) {
    const grouped = new Map();

    for (const subtask of subtasks) {
      const assigneeName = pickText(subtask.assigneeName) || "Unassigned";
      if (!grouped.has(assigneeName)) {
        grouped.set(assigneeName, []);
      }

      grouped.get(assigneeName).push(subtask);
    }

    return Array.from(grouped.entries())
      .sort(([leftName], [rightName]) => compareAssigneeNames(leftName, rightName))
      .map(([assigneeName, items]) => ({
        assigneeName,
        items: items.slice().sort(compareSubtasksByKey)
      }));
  }

  function getVisibleGroups(subtasks) {
    return groupSubtasksByAssignee(subtasks).filter(
      (group) => !group.items.every((subtask) => status.isCancelledStatus(subtask))
    );
  }

  function countCompletedSubtasks(subtasks) {
    return subtasks.reduce(
      (count, subtask) => (!status.isCancelledStatus(subtask) && status.isDoneStatus(subtask) ? count + 1 : count),
      0
    );
  }

  function countTrackableSubtasks(subtasks) {
    return subtasks.reduce((count, subtask) => (!status.isCancelledStatus(subtask) ? count + 1 : count), 0);
  }

  function buildMetric(subtasks) {
    return {
      completed: countCompletedSubtasks(subtasks),
      total: countTrackableSubtasks(subtasks)
    };
  }

  // Keep layout-specific filtering in one place so header metrics and rendered
  // content always describe the same visible subtask set.
  function buildPresentationModel(subtasks, layoutMode) {
    if (!subtasks.length) {
      return {
        emptyState: {
          copy: "This issue does not have any subtasks yet.",
          title: "No subtasks"
        },
        layoutMode,
        metric: buildMetric([])
      };
    }

    const activeSubtasks = subtasks.filter((subtask) => !status.isCancelledStatus(subtask));
    if (!activeSubtasks.length) {
      return {
        emptyState: {
          copy: "All subtasks are cancelled.",
          title: "No active subtasks"
        },
        layoutMode,
        metric: buildMetric([])
      };
    }

    if (layoutMode === "grouped") {
      const groups = getVisibleGroups(activeSubtasks);
      const visibleSubtasks = groups.flatMap((group) => group.items);

      if (!groups.length) {
        return {
          emptyState: {
            copy: "All assignee groups only contain cancelled subtasks.",
            title: "No active assignee groups"
          },
          layoutMode,
          metric: buildMetric([])
        };
      }

      return {
        groups,
        layoutMode,
        metric: buildMetric(visibleSubtasks)
      };
    }

    const items = activeSubtasks.slice().sort(compareSubtasksForList);
    return {
      items,
      layoutMode,
      metric: buildMetric(items)
    };
  }

  function buildGroupStateKey(issueKey, assigneeName) {
    return `${issueKey}::${assigneeName}`;
  }

  function pickText(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  JiraEnhance.presentation = {
    buildGroupStateKey,
    buildPresentationModel
  };
})();
