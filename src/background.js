// Toggle the in-page panel when the extension icon is clicked.
chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: "toggle-panel" }).catch(() => {
      // Content script is not present on this page (unsupported site); ignore.
    });
  }
});
