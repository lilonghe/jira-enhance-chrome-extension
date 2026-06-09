# Maintenance Notes

## Architecture

- `src/config.js`: shared constants, selectors, storage keys, and Jira field lists.
- `src/status.js`: maps Jira status names and category colors to UI semantics.
- `src/api.js`: fetches parent issue data plus richer subtask fields, reads blocked-by links from the same response, then caches the result for one minute.
- `src/presentation.js`: converts raw subtasks into a layout-specific view model.
- `src/view.js`: renders the popover DOM from the presentation model.
- `src/content.js`: owns hover lifecycle, Jira card detection, board-card date formatting, popover positioning, and click interactions.
- `src/background.js`: opens the extension options page from extension-controlled context.
- `src/options.html`, `src/options.css`, `src/options.js`: extension options page for configuring board-card display mode, board-card date format, blocked-bug visibility, empty-state auto-close timing, and issue type filters.
- `src/content.css`: visual styling and the in-progress ripple animation.

## Data flow

1. `content.js` scans board cards and rewrites slash-separated Jira date labels into the configured output format.
2. `content.js` detects the hovered Jira card and extracts the issue key.
3. `api.js` loads the parent issue plus subtask status and assignee data.
4. `api.js` reads bug-only blocked links from `issuelinks` and renders them in a collapsed section above the subtask content.
5. `presentation.js` applies layout rules:
   - list mode sorts by status, then key
   - cancelled subtasks move to the end of each visible list or assignee group
   - grouped mode moves assignee groups with only cancelled subtasks to the end and marks them for default collapse
6. `view.js` renders the header, settings trigger, state blocks, blocked-by section, grouped sections, or flat list.
7. `content.js` swaps the popover body in place without refetching when the user changes layout settings or collapses a group.
8. When a hover result has no subtasks and no visible blocked bugs, `content.js` can auto-close that empty popover after the configured number of milliseconds.

## Where to change Jira DOM heuristics

- Card detection lives in `src/config.js` and `src/content.js`.
- Update `CARD_SELECTOR` when Jira changes board card wrappers.
- Update `SUMMARY_SELECTORS` when summary text moves inside the card.
- Update `ISSUE_TYPE_SELECTORS` when Jira changes where issue type is exposed on the card.
- Update `DEFAULT_SKIPPED_ISSUE_TYPES` when you want different default filters in the options page.
- Update `DEFAULT_CARD_DATE_FORMAT` when a different board-card date output should be the default.
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
5. Turn on `Show blocked bugs`, then confirm a collapsed `BLOCKED BY BUGS` section appears above the subtask content when the hovered issue is blocked by bug issues.
6. In grouped mode:
   - subtasks are grouped by assignee
   - assignee rows can collapse and expand
   - rows do not repeat the assignee name
   - cancelled subtasks appear at the end of a group
   - assignee groups with only cancelled subtasks appear after groups with active work
   - cancelled-only assignee rows are struck through and start collapsed
7. In list mode:
   - `todo` and `in progress` appear before `done`
   - cancelled subtasks appear at the end
8. Hover status dots and titles to confirm tooltips show status text and full issue text.
9. Click a subtask row or blocked issue row and confirm it opens the Jira issue in a new tab.
10. Click the top-right settings icon and confirm it opens the extension options page.
11. Change the display mode, save, and confirm the popover rerenders in the selected layout.
12. Change `Card date format`, save, and confirm board-card dates such as `24/六月/26` rerender into the chosen pattern.
13. Set `Empty auto close (ms)` to a positive value, hover an issue with no visible content, and confirm the popover closes after that delay.
14. Change the skipped issue types, save, and confirm matching cards stop fetching.

## Release flow

1. Update `manifest.json` version.
2. Create and push a tag in the form `vX.Y.Z`.
3. `.github/workflows/release.yml` checks that the tag version matches the manifest.
4. `scripts/package-extension.sh` builds the release zip from `manifest.json`, `icons/`, and `src/`; source artwork should live under `design/` so it stays out of the release zip.
5. GitHub Actions uploads the zip as both:
   - a workflow artifact
   - a GitHub Release asset
6. The release workflow also publishes a stable latest-download asset named `jira-enhance.zip`, so the direct URL can stay fixed across versions.

## Current assumptions

- The extension targets Jira boards that expose issue keys either in attributes, browse links, or visible text.
- It relies on Jira REST endpoints under `/rest/api/2`.
- Cancelled subtasks are excluded from progress, but still rendered at the end for reference.
