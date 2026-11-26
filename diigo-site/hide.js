// Hidden tags on diigo.com (hideOnDiigo): the bookmarks with a hidden tag and the hidden tags themselves out of your
// library there, as in the Swift Library; else they would show on diigo.com, to anyone looking at your screen.
// - hide-page.js, in the page itself, takes them out of the answers of Diigo's requests: told here what is hidden
//   (publishHidden), kept in localStorage of diigo.com so it knows at once on the next page
// - here, in case one comes another way: a bookmark of the list (.ListItem, its tags in .tags .Tag .wrapper, as
//   delete-window.js reads them) with a hidden tag is not shown (hideItems)
// Only in your own library (/user/<you>, /profile/<you>), and not when you search for such a tag.

const HIDDEN_KEY = 'swiftHiddenTags';
const HIDDEN_CLASS = 'dqa-hidden-tag';
// Show hidden on diigo.com, this tab only (sessionStorage, so it is off again in a new tab): while on, nothing is
// taken out, as Show hidden in the Swift Library.
const SHOW_KEY = 'swiftShowHiddenDiigo';

const showingHidden = () => {
  try {
    return sessionStorage.getItem(SHOW_KEY) == '1';
  } catch (e) {
    return false;
  }
};

// the hidden tags to take out now: none with hideOnDiigo off, or while Show hidden is on
function hiddenNow() {
  return settings.hideOnDiigo !== false && !showingHidden() ? hiddenTagNames(settings) : [];
}

// what is hidden, for hide-page.js; nothing with hideOnDiigo off or while Show hidden is on
function publishHidden() {
  const tags = hiddenNow();
  const value = tags.length ? JSON.stringify({user, tags}) : '';
  try {
    if (value) localStorage.setItem(HIDDEN_KEY, value);
    else localStorage.removeItem(HIDDEN_KEY);
  } catch (e) {
    // no localStorage on diigo.com (blocked): the event below still counts for this page
  }
  document.dispatchEvent(new CustomEvent('swift-hidden-tags', {detail: value}));
}

// your own library, and not a search for a hidden tag (its address or the search box)
function hidesHere(tags) {
  const name = location.pathname.match(/^\/(?:user|profile)\/([^/?#]+)/)?.[1];
  if (!name || user && decodeURIComponent(name).toLowerCase() != user.toLowerCase()) return false;
  const searched = [decodeURIComponent(location.search + location.hash),
    ...[...document.querySelectorAll('input[type="text"], input[type="search"]')].map(input => input.value)]
    .join(' ').toLowerCase().split(/[\s,"':=&?#/+]+/);
  return !searched.some(word => word && tags.includes(word));
}

function hideItems() {
  const tags = hiddenNow();
  const on = tags.length > 0 && hidesHere(tags);
  for (const item of document.querySelectorAll('.ListItem')) {
    const hide = on && [...item.querySelectorAll('.tags .Tag .wrapper')]
      .some(el => tags.includes(String(el.title || el.textContent).trim().toLowerCase()));
    if (item.classList.contains(HIDDEN_CLASS) != hide) item.classList.toggle(HIDDEN_CLASS, hide);
  }
}

// your own library page (/user/<you>, /profile/<you>), where hiding happens
function onOwnLibrary() {
  const name = location.pathname.match(/^\/(?:user|profile)\/([^/?#]+)/)?.[1];
  return !!name && (!user || decodeURIComponent(name).toLowerCase() == user.toLowerCase());
}

// Show hidden on diigo.com: a checkbox on your own library when you have hidden tags, to show them for this tab (as
// Show hidden in the Swift Library). On: hide-page.js stops taking them out (publishHidden), and the page is reloaded
// so Diigo fetches them again (they were taken out of the answers before). Off: taken out again and hidden at once, no
// reload, so there is no flash where they show. Off again in a new tab.
function showHiddenToggle() {
  const here = onOwnLibrary() && settings.hideOnDiigo !== false && hiddenTagNames(settings).length > 0;
  let box = document.getElementById('dqa-show-hidden');
  if (!here) return box?.remove();
  if (!box) {
    box = document.createElement('label');
    box.id = 'dqa-show-hidden';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => toggleShowHidden(input.checked));
    box.append(input, document.createTextNode(' ' + browser.i18n.getMessage('libraryShowHidden')));
    document.body.append(box);
  }
  box.querySelector('input').checked = showingHidden();
}

function toggleShowHidden(show) {
  try {
    if (show) sessionStorage.setItem(SHOW_KEY, '1');
    else sessionStorage.removeItem(SHOW_KEY);
  } catch (e) {
    // no sessionStorage (blocked): the reload below still shows them for this load
  }
  publishHidden();
  if (show) location.reload();
  else hideItems();
}
