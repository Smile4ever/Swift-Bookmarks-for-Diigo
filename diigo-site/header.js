// The menu at the top of diigo.com: Diigo's own items (My Library, My Outliners, My Groups, Tools, Go Premium…) as Diigo
// draws them, untouched, and after them one button of the add-on, Go to Swift Library, while you're signed in: the way
// to the Swift Library, which has the other Swift pages in its own menu. Nothing to set for it.
// That menu comes in four versions: .MainNav .inner > ul in the library (React), #main-nav on pages Diigo draws on its
// server such as /buzz, #topNav ul on the homepage, and header .nav-line > nav on pages such as /tools, where the items
// are links side by side (a), not in a list (li > a). In the library the items sit in a list React draws: when React
// drops the button, update() adds it again.

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

// The button: the icon of the add-on (drawn here, as diigo.com can't load the add-on's files) and Go to Swift Library;
// a click opens it as the toolbar button does (background.js: openLibrary, the tab it is open in already)
const SVG = 'http://www.w3.org/2000/svg';

function swiftIcon() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 128 128');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attributes] of [
    ['rect', {x: 4, y: 4, width: 120, height: 120, rx: 28, fill: '#3f98e5'}],
    ['path', {d: 'M38 22h52a6 6 0 0 1 6 6v80l-32-20-32 20V28a6 6 0 0 1 6-6z', fill: '#fff'}],
    ['path', {d: 'M70 32 48 62h14l-6 22 24-32H66z', fill: '#3f98e5'}],
  ]) {
    const shape = document.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
    svg.append(shape);
  }
  return svg;
}

// asLink: for header nav, a link on its own
function swiftButton(asLink) {
  const link = document.createElement('a');
  link.href = '#';
  link.className = 'dqa-swift-button';
  link.append(swiftIcon(), browser.i18n.getMessage('goToSwiftLibrary'));
  link.addEventListener('click', openPage('openLibrary'));
  if (asLink) {
    link.dataset.dqaSwift = '';
    return link;
  }
  const li = document.createElement('li');
  li.dataset.dqaSwift = '';
  li.append(link);
  return li;
}

// at the end of the menu, once; only while signed in, as the Swift Library is your library
function updateMenu(menu) {
  const button = menu.querySelector(':scope > [data-dqa-swift]');
  if (!user) return button?.remove();
  if (button && button == menu.lastElementChild) return;
  // drawn again after it by Diigo: moved to the end, as each move is a change of the page that calls update() again
  menu.append(button || swiftButton(menu.tagName == 'NAV'));
}

// called by update() in diigo-site.js
function updateHeader() {
  document.querySelectorAll(MENUS).forEach(menu => {
    updateMenu(menu);
    markMenu(menu);
  });
}


// ---- My Library: always Diigo's own; toolsToSwift: Tools opens Swift Tools ----
// My Library in the menu at the top (here, and on groups.diigo.com) is your library as Diigo has it, chosen: never
// taken over. With myLibraryToSwift, going to your library on diigo.com in any other way (a link, a bookmark, the
// address typed) opens the Swift Library (background.js: libraryToSwift), so My Library leads there with ?swift=false
// (DIIGO_OWN): its link has it, for Ctrl+click and a middle click too, and a plain click loads that page, as in the
// library React would only change the address to /user/<name>, which the background script takes as going there.
// Tools: a plain click opens Swift Tools in this tab (toolsToSwift); Ctrl+click, Shift+click or a middle click
// Diigo's own, as the browser opens it.

const TAKEN_OVER = {
  tools: {setting: 'toolsToSwift', type: 'openTools', title: 'toolsToSwiftTitle'},
};

// Diigo's My Library and Tools in a menu, the li or (header nav) the link, with which it is
const diigoMenuItems = menu => [...menu.children].filter(item => !item.dataset.dqaSwift &&
  ['library', 'tools'].includes(diigoItemId(item)));

// My Library with ?swift=false while myLibraryToSwift is on (and without again when it's off); Tools with how to get
// to Diigo's own, on hovering it. Only set when it changes, as each change is one of the page.
function markMenu(menu) {
  for (const item of diigoMenuItems(menu)) {
    const link = linkOf(item);
    if (!link) continue;
    const id = diigoItemId(item);
    if (id == 'library') {
      const href = link.getAttribute('href') || '';
      const own = href.includes(DIIGO_OWN);
      const on = settings.myLibraryToSwift && !!user;
      if (on && !own) link.setAttribute('href', href.replace(/([?#]|$)/, m => DIIGO_OWN + (m == '?' ? '&' : m)));
      if (!on && own) link.setAttribute('href', href.replace(DIIGO_OWN + '&', '?').replace(DIIGO_OWN, ''));
      continue;
    }
    const over = TAKEN_OVER[id];
    const title = settings[over.setting] && user ? browser.i18n.getMessage(over.title) : '';
    if ((link.dataset.dqaTitle || '') == title) continue;
    if (title) link.title = title;
    else link.removeAttribute('title');
    link.dataset.dqaTitle = title;
  }
}

// in the capture phase, before React's own handler in the library: a plain click only; one with Ctrl, Shift or the
// middle button goes as the browser opens it
document.addEventListener('click', e => {
  if (e.button != 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || !user) return;
  const link = e.target.closest?.('a');
  const menu = link?.closest(MENUS);
  const item = menu && diigoMenuItems(menu).find(item => item.contains(link));
  const id = item && diigoItemId(item);
  if (id == 'library' && settings.myLibraryToSwift) {
    // Diigo's own as a page of its own, with ?swift=false
    e.preventDefault();
    e.stopImmediatePropagation();
    const url = new URL(link.href);
    url.searchParams.set('swift', 'false');
    location.assign(url.href);
  } else if (id == 'tools' && settings.toolsToSwift) {
    e.preventDefault();
    e.stopImmediatePropagation();
    browser.runtime.sendMessage({type: TAKEN_OVER.tools.type, here: true}).catch(() => {});
  }
}, true);
