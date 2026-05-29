# Jira Enhance

A lightweight Chrome extension that shows a popover with subtasks when you hover a board card.

## What it does

- Detects Jira issue cards on board pages.
- Fetches the issue details from Jira's REST API.
- Shows the parent issue summary and all subtasks in a hover popover.
- Opens each subtask in a new tab when clicked.

## Project structure

- `manifest.json`: Chrome extension manifest.
- `icons/`: Extension icon assets.
- `src/content.js`: Jira card detection, hover state, REST fetch, and popover rendering.
- `src/content.css`: Popover styles.

## Load in Chrome

1. Open `chrome://extensions`.
2. Turn on `Developer mode`.
3. Click `Load unpacked`.
4. Select `/Users/llh/code/personal/vibe-coding/jira-subtask-hover`.

## Notes

- The extension uses `GET /rest/api/2/issue/{issueKey}?fields=summary,subtasks,status`.
- It is written without a build step, so you can edit and reload directly.
- If your Jira board is heavily customized, the card selector heuristics live in `src/content.js`.
