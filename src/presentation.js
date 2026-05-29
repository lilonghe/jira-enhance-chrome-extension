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

  function compareSubtasksForGrouped(left, right) {
    const leftCancelled = status.isCancelledStatus(left);
    const rightCancelled = status.isCancelledStatus(right);

    if (leftCancelled !== rightCancelled) {
      return leftCancelled ? 1 : -1;
    }

    return compareSubtasksByKey(left, right);
  }

  function compareSubtasksForDisplay(left, right) {
    const leftCancelled = status.isCancelledStatus(left);
    const rightCancelled = status.isCancelledStatus(right);

    if (leftCancelled !== rightCancelled) {
      return leftCancelled ? 1 : -1;
    }

    if (leftCancelled && rightCancelled) {
      return compareSubtasksByKey(left, right);
    }

    return compareSubtasksForList(left, right);
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
      .map(([assigneeName, items]) => {
        const sortedItems = items.slice().sort(compareSubtasksForGrouped);

        return {
          assigneeName,
          isCancelledOnly: sortedItems.every((subtask) => status.isCancelledStatus(subtask)),
          metric: buildGroupMetric(sortedItems),
          items: sortedItems
        };
      })
      .sort(compareGroupsForDisplay);
  }

  function compareGroupsForDisplay(leftGroup, rightGroup) {
    if (leftGroup.isCancelledOnly !== rightGroup.isCancelledOnly) {
      return leftGroup.isCancelledOnly ? 1 : -1;
    }

    return compareAssigneeNames(leftGroup.assigneeName, rightGroup.assigneeName);
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

  function buildGroupMetric(subtasks) {
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

    if (layoutMode === "grouped") {
      const groups = groupSubtasksByAssignee(subtasks);
      const visibleSubtasks = groups.flatMap((group) => group.items);

      return {
        groups,
        layoutMode,
        metric: buildMetric(visibleSubtasks)
      };
    }

    const items = subtasks.slice().sort(compareSubtasksForDisplay);
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
