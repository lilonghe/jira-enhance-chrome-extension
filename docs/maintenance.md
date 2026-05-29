# Maintenance Notes

## Architecture

- `src/config.js`: shared constants, selectors, storage keys, and Jira field lists.
- `src/status.js`: maps Jira status names and category colors to UI semantics.
- `src/api.js`: fetches parent issue data plus richer subtask fields, then caches the result for one minute.
- `src/presentation.js`: converts raw subtasks into a layout-specific view model.
- `src/view.js`: renders the popover DOM from the presentation model.
- `src/content.js`: owns hover lifecycle, Jira card detection, popover positioning, and click interactions.
- `src/background.js`: opens the extension options page from extension-controlled context.
- `src/options.html`, `src/options.css`, `src/options.js`: extension options page for configuring board-card display mode and issue type filters.
- `src/content.css`: visual styling and the in-progress ripple animation.

## Data flow

1. `content.js` detects the hovered Jira card and extracts the issue key.
2. `api.js` loads the parent issue plus subtask status and assignee data.
3. `presentation.js` applies layout rules:
   - list mode sorts by status, then key
   - cancelled subtasks move to the end of each visible list or assignee group
   - grouped mode moves assignee groups with only cancelled subtasks to the end and marks them for default collapse
4. `view.js` renders the header, settings trigger, state blocks, grouped sections, or flat list.
5. `content.js` swaps the popover body in place without refetching when the user changes layout settings or collapses a group.

## Where to change Jira DOM heuristics

- Card detection lives in `src/config.js` and `src/content.js`.
- Update `CARD_SELECTOR` when Jira changes board card wrappers.
- Update `SUMMARY_SELECTORS` when summary text moves inside the card.
- Update `ISSUE_TYPE_SELECTORS` when Jira changes where issue type is exposed on the card.
- Update `DEFAULT_SKIPPED_ISSUE_TYPES` when you want different default filters in the options page.
- Update `DEFAULT_LAYOUT_MODE` when grouped vs list should default differently.
- `extractIssueKey()` in `src/content.js` is the fallback chain for keys:
  - issue key attributes
  - direct `/browse/KEY-123` links
  - nested browse links
  - regex match from card text

## Where to change status behavior

- Status keyword matching lives in `src/status.js`.
- `classifyStatus()` is the source of truth for:
  - `todo`
  - `in_progress`
  - `done`
  - `cancelled`
- `mapStatusTone()` controls the color family used by the UI.
- `getStatusRank()` controls list-mode ordering.

## Manual verification checklist

1. Reload the unpacked extension in `chrome://extensions`.
2. Open a Jira board with cards that contain subtasks.
3. Hover a card and confirm the popover appears after a short delay.
4. Confirm the header shows `done/total` and the ring progress matches the visible subtasks.
5. In grouped mode:
   - subtasks are grouped by assignee
   - assignee rows can collapse and expand
   - rows do not repeat the assignee name
   - cancelled subtasks appear at the end of a group
   - assignee groups with only cancelled subtasks appear after groups with active work
   - cancelled-only assignee rows are struck through and start collapsed
6. In list mode:
   - `todo` and `in progress` appear before `done`
   - cancelled subtasks appear at the end
7. Hover status dots and titles to confirm tooltips show status text and full issue text.
8. Click a subtask row and confirm it opens the Jira issue in a new tab.
9. Click the top-right settings icon and confirm it opens the extension options page.
10. Change the display mode, save, and confirm the popover rerenders in the selected layout.
11. Change the skipped issue types, save, and confirm matching cards stop fetching.

## Release flow

1. Update `manifest.json` version.
2. Create and push a tag in the form `vX.Y.Z`.
3. `.github/workflows/release.yml` checks that the tag version matches the manifest.
4. `scripts/package-extension.sh` builds the release zip from `manifest.json`, `icons/`, and `src/`; source artwork should live under `design/` so it stays out of the release zip.
5. GitHub Actions uploads the zip as both:
   - a workflow artifact
   - a GitHub Release asset

## Current assumptions

- The extension targets Jira boards that expose issue keys either in attributes, browse links, or visible text.
- It relies on Jira REST endpoints under `/rest/api/2`.
- Cancelled subtasks are excluded from progress, but still rendered at the end for reference.
