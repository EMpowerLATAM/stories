/* Site settings. This is the only file you need to edit to point the site at another spreadsheet. */
window.STORIES_CONFIG = {
  // ID of the Google Sheet (the long code in its URL, between /d/ and /edit).
  // The sheet must be shared as "Anyone with the link: Viewer".
  sheetId: "1FNmG1TWTz5iPT0aQoT1MBKHYSqN3YtA1v7YEGAkBEpA",

  // Name of the tab that holds the stories.
  sheetName: "Stories",

  // Name of the tab with all the site texts (titles, numbers, labels, links) in every language.
  // If it is missing or cannot be read, the site uses the default texts in assets/js/i18n.js.
  textsSheet: "Site texts",

  // Only rows with one of these values in the "Status" column are shown.
  publish: ["Ready to publish", "Published"],

  // Extra statuses shown when the page is opened with ?preview at the end of the URL.
  preview: ["To review", "Pending: consent"]
};
