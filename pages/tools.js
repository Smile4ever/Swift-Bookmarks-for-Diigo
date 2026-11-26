// Tools (tools.html): Diigo's Tools page (diigo.com/tools) as a page of the add-on, with the menu at the top and your
// name as in the Swift Library. The tools themselves are in the page; here only the texts, the menu and who you are.

const $ = id => document.getElementById(id);
const message = (key, substitutions) => browser.i18n.getMessage(key, substitutions);

document.documentElement.lang = browser.i18n.getUILanguage();
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = message(el.dataset.i18n);
document.title += ' - Swift Bookmarks for Diigo';

let user = '';                   // signed in on diigo.com
let settings = DEFAULT_SETTINGS;  // see pages/settings.js

function element(tag, className, content) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (content) el.textContent = content;
  return el;
}

// the menu at the top, as in the Swift Library (library-side.js: showMainNav)
const MENU_LINKS = {
  // Diigo's own, also with myLibraryToSwift (settings.js: DIIGO_OWN)
  library: () => ({label: message('diigoMyLibrary'), url: `https://www.diigo.com/user/${encodeURIComponent(user)}${DIIGO_OWN}`}),
  outliners: () => ({label: message('diigoMyOutliners'), url: 'https://www.diigo.com/outliner'}),
  groups: () => ({label: message('diigoMyGroups'), url: 'https://groups.diigo.com'}),
  // this page itself
  tools: () => ({label: menuName('toolsMenu'), url: location.pathname, here: true}),
  // Swift Guide, the guide of the add-on, in the place of Diigo's Learn more (guide.html)
  learnMore: () => ({label: menuName('guideMenu'), url: 'guide.html'}),
  premium: () => ({label: message('diigoPremium'), url: 'https://www.diigo.com/premium'}),
  fastLibrary: () => ({label: menuName('libraryMenu'), url: 'library.html'}),
  discover: () => ({label: menuName('discoverMenu'), url: 'discover.html'}),
  options: () => ({label: menuName('optionsMenu'), url: 'options.html'}),
};

function showMainNav() {
  $('mainNav').replaceChildren(...swiftNavItems().map(item => {
    // a link of your own, once it has a web address
    const link = MENU_LINKS[item.id]?.() ||
      (/^https?:\/\/./i.test(item.url || '') && {label: item.label.trim() || new URL(item.url).hostname, url: item.url});
    if (!link) return null;
    const li = element('li', link.here ? 'active' : '');
    const a = element('a', '', link.label);
    a.href = link.url;
    li.append(a);
    return li;
  }).filter(Boolean));
  // your name and its menu, as on diigo.com (user-menu.js)
  showUserMenu(user);
}

// signed out, in or as someone else on diigo.com meanwhile (background.js: setUser)
browser.runtime.onMessage.addListener(request => {
  if (request?.type != 'userChanged' || request.user == user) return;
  user = request.user || '';
  showMainNav();
});

Promise.allSettled([browser.runtime.sendMessage({type: 'user'}), loadSettings()]).then(([name, loaded]) => {
  user = name.value || '';
  settings = loaded.value || DEFAULT_SETTINGS;
  showMainNav();
});
