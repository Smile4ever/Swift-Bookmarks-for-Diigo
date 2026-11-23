// Hidden tags on diigo.com (hideOnDiigo): the bookmarks with a hidden tag and the hidden tags themselves out of your
// library there, as in the Swift Library; else they would show on diigo.com, to anyone looking at your screen.
// - hide-page.js, in the page itself, takes them out of the answers of Diigo's requests: told here what is hidden
//   (publishHidden), kept in localStorage of diigo.com so it knows at once on the next page
// - here, in case one comes another way: a bookmark of the list (.ListItem, its tags in .tags .Tag .wrapper, as
//   delete-window.js reads them) with a hidden tag is not shown (hideItems)
// Only in your own library (/user/<you>, /profile/<you>), and not when you search for such a tag.

const HIDDEN_KEY = 'swiftHiddenTags';
const HIDDEN_CLASS = 'dqa-hidden-tag';

// what is hidden, for hide-page.js; nothing with hideOnDiigo off
function publishHidden() {
  const tags = settings.hideOnDiigo !== false ? hiddenTagNames(settings) : [];
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
  const tags = settings.hideOnDiigo !== false ? hiddenTagNames(settings) : [];
  const on = tags.length > 0 && hidesHere(tags);
  for (const item of document.querySelectorAll('.ListItem')) {
    const hide = on && [...item.querySelectorAll('.tags .Tag .wrapper')]
      .some(el => tags.includes(String(el.title || el.textContent).trim().toLowerCase()));
    if (item.classList.contains(HIDDEN_CLASS) != hide) item.classList.toggle(HIDDEN_CLASS, hide);
  }
}
