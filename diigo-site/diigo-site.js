// Runs on www.diigo.com, and on groups.diigo.com (My Groups) for the menu at the top, after pages/settings.js and the
// other scripts of diigo-site/ (manifest.json, in this order):
// - common.js: what they share (settings, user)
// - delete-window.js: what Diigo's delete window deletes goes to the trash of the Swift Library
// - public-library.js: Public Library from the pages of the add-on, opened as Diigo's library opens it
// - header.js: the menu at the top: Go to Swift Library after Diigo's own items, and My Library and Tools opening the
//   Swift pages when chosen on the options page
// - hide.js (with hide-page.js, in the page itself): what has a hidden tag out of your library there (hideOnDiigo)
// - diigo-site.css: the looks of these
// This one runs it all. The site is a React app, so new elements are handled as they appear.
// The add-on no longer changes diigo.com itself: what it does better is in the Swift Library and Swift Discover, pages
// of the add-on. This is what is left: the way there, and hidden tags kept hidden, as they would show there otherwise. The trash of the Swift Library is only in this browser, so it
// isn't shown on diigo.com, where it would look like Diigo's own; what Diigo's delete window deletes goes to it all the
// same (delete-window.js), to put back in the Swift Library.

// the words of pdf-view.js (a PDF opened from the Swift Library), which runs in the page itself without browser.i18n;
// on every page, as which script runs first isn't fixed and pdf-view.js takes its flag out of the address at once
for (const [key, name] of [['swiftPdfReader', 'pdfViewReader'], ['swiftPdfLoading', 'pdfViewLoading'],
  ['swiftPdfFailed', 'pdfViewFailed']]) {
  document.documentElement.dataset[key] = browser.i18n.getMessage(name);
}

// The address of the file of a PDF, found by pdf-view.js in the page itself (#swift-pdf-file), to background.js
// (pdfFound), which only takes it from a tab it opened for that
window.addEventListener('message', e => {
  if (e.source != window || e.origin != location.origin || typeof e.data?.swiftPdfFile != 'string') return;
  browser.runtime.sendMessage({type: 'pdfFound', url: e.data.swiftPdfFile}).catch(() => {});
});

function update() {
  updateHeader();
  hideItems();
  showHiddenToggle();
}

function applySettings(newSettings) {
  settings = newSettings;
  publishHidden();
  update();
}

let pending = false;
const observer = new MutationObserver(() => {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    update();
  });
});

Promise.all([loadSettings(), browser.runtime.sendMessage({type: 'user'}).catch(() => '')]).then(([loaded, name]) => {
  user = name || '';
  applySettings(loaded);
  observer.observe(document.documentElement, {childList: true, subtree: true});
});

// a change on the options page applies right away
browser.storage.onChanged.addListener((changes, area) => settingsArea(area) && loadSettings().then(applySettings));
