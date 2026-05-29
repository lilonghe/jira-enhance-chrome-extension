chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "jira-enhance:open-options-page") {
    return false;
  }

  // Content scripts should ask the extension runtime to open the options page
  // instead of navigating the tab directly to an internal extension URL.
  chrome.runtime.openOptionsPage().then(
    () => sendResponse({ ok: true }),
    (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
  );

  return true;
});
