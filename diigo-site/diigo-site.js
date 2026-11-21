// Runs on www.diigo.com, and on groups.diigo.com (My Groups) for the menu at the top, after options/settings.js and the
// other scripts of diigo-site/ (manifest.json, in this order):
// - common.js: what they share (settings, user)
// - delete-window.js: what Diigo's delete window deletes goes to the trash of the Swift Library
// - public-library.js: Public Library from the pages of the add-on, opened as Diigo's library opens it
// - header.js: menuItems, the menu at the top: which items show, in which order, links of your own, and the items of
//   the add-on: Swift Library, Swift Discover and Learn more (Diigo's tour)
// - diigo-site.css: the looks of these
// This one runs it all. The site is a React app, so new elements are handled as they appear.
// The add-on no longer changes diigo.com itself: what it does better is in the Swift Library and Swift Discover, pages
// of the add-on. This is what is left: the ways there. The trash of the Swift Library is only in this browser, so it
// isn't shown on diigo.com, where it would look like Diigo's own; what Diigo's delete window deletes goes to it all the
// same (delete-window.js), to put back in the Swift Library.

function update() {
  updateHeader();
}

function applySettings(newSettings) {
  settings = newSettings;
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
browser.storage.onChanged.addListener(() => loadSettings().then(applySettings));
