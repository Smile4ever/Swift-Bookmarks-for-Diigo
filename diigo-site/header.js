// The menu at the top of diigo.com, as set on the options page (menuItems in options/settings.js): which items show, in
// which order, and links of your own. Diigo's own items (My Library, My Outliners, My Groups, Tools, Go Premium) stay where Diigo
// draws them, only hidden (data-dqa-menu-off, diigo-site.css) or moved into their order: in the library they are links
// of React, which open the page without loading it again. Items of Diigo that aren't on the options page (My
// <company>...) go at the end. The items of the add-on and your links are added here: Swift Library,
// Swift Discover (the Hot Bookmarks of the Diigo community, options/discover.html) and Learn more (Diigo's tour of what
// it does).
// That menu comes in four versions: .MainNav .inner > ul in the library (React), #main-nav on pages Diigo draws on its
// server such as /buzz, #topNav ul on the homepage, and header .nav-line > nav on pages such as /tools, where the items
// are links side by side (a), not in a list (li > a). In the library the items sit in a list React draws: when React
// drops them, update() adds them again.

const MENUS = '.MainNav .inner > ul, #main-nav, #topNav ul, header .nav-line > nav';

// in header nav the items are the links themselves, elsewhere a li with a link in it
const linkOf = item => item.tagName == 'A' ? item : item.querySelector(':scope > a');

// Diigo's own items, known by their name on diigo.com (in English, as the site is), else by where they lead. The name
// first: on /tools My Library leads elsewhere than /user/<name>, and a hidden link for teams leads to groups.diigo.com
// too, which isn't My Groups.
const DIIGO_MENU_NAMES = {library: 'my library', outliners: 'my outliners', groups: 'my groups', tools: 'tools',
  premium: 'go premium'};
const DIIGO_MENU_ITEMS = {
  library: url => url.host == 'www.diigo.com' && /^\/user\/[^/]+\/?$/.test(url.pathname),
  outliners: url => url.host == 'www.diigo.com' && /^\/outliners?\/?$/.test(url.pathname),
  groups: url => url.host == 'groups.diigo.com' && url.pathname == '/',
  tools: url => url.host == 'www.diigo.com' && url.pathname == '/tools',
  premium: url => url.host == 'www.diigo.com' && /^\/premium\/?$/.test(url.pathname),
};

// the items of the add-on; Learn more is a name on diigo.com, in English like the rest of its menu
const ADDON_MENU_ITEMS = {
  // Swift Discover, options/discover.html, and the library of the add-on, options/library.html: pages of the add-on,
  // which diigo.com can't link to itself
  discover: {message: 'discoverMenu', url: '#', click: openPage('openDiscover')},
  // the options page of the add-on
  options: {message: 'optionsMenu', url: '#', click: openPage('openOptions')},
  learnMore: {label: 'Learn more', url: 'https://www.diigo.com/learn_more', page: '/learn_more'},
  fastLibrary: {message: 'libraryMenu', url: '#', click: openPage('openLibrary'), signedIn: true},
};

function openPage(type) {
  return e => {
    e.preventDefault();
    browser.runtime.sendMessage({type}).catch(() => {});
  };
}

function diigoItemId(li) {
  const link = linkOf(li);
  const name = link?.textContent.trim().toLowerCase();
  const byName = Object.keys(DIIGO_MENU_NAMES).find(id => DIIGO_MENU_NAMES[id] == name);
  if (byName) return byName;
  // not by where it leads when it has no name or leads nowhere: the hidden link for teams on /tools is empty, with
  // href="#", which the browser makes /tools#
  if (!name || link.getAttribute('href')?.startsWith('#')) return '';
  const href = link.href;
  let url;
  try {
    url = new URL(href);
  } catch (e) {
    return '';
  }
  return Object.keys(DIIGO_MENU_ITEMS).find(id => DIIGO_MENU_ITEMS[id](url)) || '';
}

// what the add-on puts in the menu for an item of menuItems, or null when it adds nothing for it
function addedItem(item) {
  if (DIIGO_MENU_ITEMS[item.id] || !item.shown) return null;
  const own = ADDON_MENU_ITEMS[item.id];
  if (own) return own.signedIn && !user ? null : own;
  // a link of your own, once it has a web address; on its page itself when that's the page you're on
  if (!/^https?:\/\/./i.test(item.url || '')) return null;
  let url;
  try {
    url = new URL(item.url);
  } catch (e) {
    return null;
  }
  const here = url.origin == location.origin && url.pathname == location.pathname && url.pathname != '/';
  return {label: item.label.trim() || url.hostname, url: item.url, here};
}

// asLink: for header nav, a link on its own
function menuItemElement(id, item, asLink) {
  const li = document.createElement('li');
  li.dataset.dqaMenuItem = id;
  const link = document.createElement('a');
  link.href = item.url;
  link.textContent = item.label || browser.i18n.getMessage(item.message);
  if (item.click) link.addEventListener('click', item.click);
  // on that page itself, marked as the page you're on, as Diigo does: .active on the li in the library, on the a elsewhere
  const here = item.here || !!item.page && location.pathname.startsWith(item.page);
  li.classList.toggle('active', here);
  link.classList.toggle('active', here);
  if (asLink) {
    link.dataset.dqaMenuItem = id;
    return link;
  }
  li.append(link);
  return li;
}

function updateMenu(menu, items) {
  const added = new Map([...menu.querySelectorAll(':scope > [data-dqa-menu-item]')].map(li => [li.dataset.dqaMenuItem, li]));
  for (const item of items) {
    const wanted = addedItem(item);
    const key = wanted && JSON.stringify([wanted.label, wanted.url]);
    const li = added.get(item.id);
    added.delete(item.id);
    if (li?.dataset.dqaMenuKey == key) continue;
    li?.remove();
    if (!wanted) continue;
    const el = menuItemElement(item.id, wanted, menu.tagName == 'NAV');
    el.dataset.dqaMenuKey = key;
    menu.append(el);
  }
  // items that are no longer on the options page
  added.forEach(li => li.remove());

  const current = [...menu.children];
  const indexOf = new Map(current.map(li => {
    const index = items.findIndex(item => item.id == (li.dataset.dqaMenuItem || diigoItemId(li)));
    li.toggleAttribute('data-dqa-menu-off', index >= 0 && !items[index].shown);
    return [li, index < 0 ? items.length : index];
  }));
  // in order, by moving the items themselves: Diigo floats them side by side, and a flex box with the CSS order would
  // put them lower. Only when the order is wrong, as each move is a change of the page that calls update() again.
  const sorted = [...current].sort((a, b) => indexOf.get(a) - indexOf.get(b));
  if (sorted.some((li, i) => li != current[i])) menu.append(...sorted);
}

// called by update() in diigo-site.js
function updateHeader() {
  const items = menuItemsOf(settings);
  document.querySelectorAll(MENUS).forEach(menu => {
    updateMenu(menu, items);
    markMyLibrary(menu);
  });
}


// ---- myLibraryToSwift and toolsToSwift: My Library opens the Swift Library, Tools the Tools page of the add-on ----
// A plain click on Diigo's My Library in the menu opens the Swift Library in this tab, one on Tools options/tools.html
// (My Outliners stays Diigo's own: your outliners are in the Swift Library). Diigo's own is still there: Ctrl+click, Shift+click or a middle click (auxclick, not click) opens it as
// usual, and so does its web address typed in: only this click is taken over.

// what each opens instead, while its setting is on: the message to the background script, and the tooltip
const TAKEN_OVER = {
  library: {setting: 'myLibraryToSwift', type: 'openLibrary', title: 'myLibraryToSwiftTitle'},
  tools: {setting: 'toolsToSwift', type: 'openTools', title: 'toolsToSwiftTitle'},
};

// Diigo's My Library and Tools in a menu, the li or (header nav) the link, with which it is
const myLibraryItems = menu => [...menu.children].filter(item => !item.dataset.dqaMenuItem && diigoItemId(item) in TAKEN_OVER);

// how to get to Diigo's own, on hovering it; only set when it changes, as each change is one of the page
function markMyLibrary(menu) {
  for (const item of myLibraryItems(menu)) {
    const link = linkOf(item);
    const over = TAKEN_OVER[diigoItemId(item)];
    const title = settings[over.setting] && user ? browser.i18n.getMessage(over.title) : '';
    if (!link || (link.dataset.dqaTitle || '') == title) continue;
    if (title) link.title = title;
    else link.removeAttribute('title');
    link.dataset.dqaTitle = title;
  }
}

// in the capture phase, before React's own handler in the library opens Diigo's page
document.addEventListener('click', e => {
  if (!user || e.button != 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  const link = e.target.closest?.('a');
  const menu = link?.closest(MENUS);
  const item = menu && myLibraryItems(menu).find(item => item.contains(link));
  const over = item && TAKEN_OVER[diigoItemId(item)];
  if (!over || !settings[over.setting]) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  browser.runtime.sendMessage({type: over.type, here: true}).catch(() => {});
}, true);
