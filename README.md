# Jira Enhance

A lightweight Chrome extension that shows subtask details in a hover popover on Jira boards.

## Features

- Detects Jira issue cards on common board layouts.
- Fetches subtask summary, status, and assignee data from Jira's REST API.
- Shows every subtask on a single row with status color, key, title, and assignee when needed.
- Supports two layouts:
  - grouped by assignee
  - flat list sorted by status
- Includes an options page for configuring which issue types should be skipped before fetch.
- Lets you configure the popover display mode from the options page.
- Keeps cancelled subtasks at the end of the popover while excluding them from progress.
- Lets you collapse each assignee group, with cancelled-only groups starting collapsed.
- Shows a `done/total` progress badge with a ring in the popover header.
- Opens a subtask in a new tab when you click it.

## Project structure

- `manifest.json`: Chrome extension manifest.
- `icons/`: Extension runtime icon assets.
- `design/`: Source artwork kept out of the packaged extension.
- `src/config.js`: shared selectors, field lists, and storage keys.
- `src/status.js`: status classification and UI color mapping.
- `src/api.js`: Jira REST fetching and one-minute cache.
- `src/presentation.js`: grouped/list transformation and metrics.
- `src/view.js`: popover DOM rendering.
- `src/content.js`: hover lifecycle, card detection, positioning, and interaction wiring.
- `src/background.js`: opens the extension options page from the Jira content script.
- `src/options.html`, `src/options.css`, `src/options.js`: extension settings UI.
- `src/content.css`: Popover styles.
- `docs/maintenance.md`: maintainer notes and verification checklist.

## Behavior details

- Grouped mode is the default layout.
- Layout preference and issue type filters are stored in `chrome.storage.sync`.
- List mode sorts subtasks by status priority, then by issue key.
- Cancelled subtasks are excluded from progress and shown at the end of the list or grouped assignee sections.
- In grouped mode, assignee sections that only contain cancelled subtasks move to the end, show a struck-through assignee row, and start collapsed.
- In-progress subtasks use a ripple animation on the status dot.

## Load in Chrome

1. Open `chrome://extensions`.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select this repository root directory, the one that contains `manifest.json`.

## Release

1. Make sure the tag version matches `manifest.json`.
2. Push a tag like `v0.2.0`.
3. GitHub Actions will:
   - validate the version
   - build `dist/jira-enhance-v0.2.0.zip`
   - build `dist/jira-enhance.zip` as the stable latest-download asset
   - upload it as a workflow artifact
   - attach both files to the GitHub Release automatically
4. The stable direct-download URL is [https://github.com/lilonghe/jira-enhance-chrome-extension/releases/latest/download/jira-enhance.zip](https://github.com/lilonghe/jira-enhance-chrome-extension/releases/latest/download/jira-enhance.zip).

## Options

1. Open the extension details page in `chrome://extensions`.
2. Click the popover settings icon or `Extension options`.
3. Choose the display mode for `Board Card -> Hover Show Subtasks`.
4. Enter issue types separated by commas, such as `Bug,Defect,缺陷,故障`.
5. Save, then hover Jira cards again.

## Notes

- The extension is intentionally build-free. Edit the source files, then reload the unpacked extension.
- Content scripts load in this order: `config -> status -> api -> presentation -> view -> content`.
- Parent issues are fetched from `/rest/api/2/issue/{issueKey}?fields=summary,subtasks`.
- Subtask details are fetched from `/rest/api/2/search` with `summary,status,assignee`.
- If your Jira board markup changes, start with `CARD_SELECTOR`, `SUMMARY_SELECTORS`, and `extractIssueKey()`.
- Display mode and issue type pre-filtering are both driven by the options page and `chrome.storage.sync`.
- Local packaging uses `bash ./scripts/package-extension.sh`.
