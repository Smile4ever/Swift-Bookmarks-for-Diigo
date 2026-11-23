// Swift Guide (guide.html): what the add-on does more than Diigo, and where to find it. The texts are in the page; here
// the menu at the top and your name (as in tools.js), the shortcut of the bookmark form as the browser has it, and the
// side bar marking the section in view (as options.js: markSection).

const $ = id => document.getElementById(id);
const message = (key, substitutions) => browser.i18n.getMessage(key, substitutions);

document.documentElement.lang = browser.i18n.getUILanguage();
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = message(el.dataset.i18n);
document.title += ' - Swift Bookmarks for Diigo';

let user = '';                   // signed in on diigo.com
let settings = DEFAULT_SETTINGS;  // see options/settings.js

function element(tag, className, content) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (content) el.textContent = content;
  return el;
}

// the menu at the top, as in the Swift Library (library-side.js: showMainNav); Swift Guide is this page
const MENU_LINKS = {
  // Diigo's own, also with myLibraryToSwift (settings.js: DIIGO_OWN)
  library: () => ({label: message('diigoMyLibrary'), url: `https://www.diigo.com/user/${encodeURIComponent(user)}${DIIGO_OWN}`}),
  outliners: () => ({label: message('diigoMyOutliners'), url: 'https://www.diigo.com/outliner'}),
  groups: () => ({label: message('diigoMyGroups'), url: 'https://groups.diigo.com'}),
  tools: () => ({label: menuName('toolsMenu'), url: 'tools.html'}),
  learnMore: () => ({label: menuName('guideMenu'), url: location.pathname, here: true}),
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

// ---- shortcuts: the keys and what they do ----

// keys: the keys of one shortcut, held together (+); or: more shortcuts that do the same, or the one and the other
// (/). What the pages do with them: form/form.js, library-page.js (findKey), library-bulk.js (deleteKey, shiftKey),
// library-edit.js and library-add.js (Ctrl+Enter), library-outliners.js (onKey).
const FORM_SHORTCUTS = [
  {keys: [], text: 'shortcutOpenForm'},  // the keys come from the browser: you can change them
  {keys: ['Enter'], text: 'shortcutSaveFromTags'},
  {keys: ['Ctrl', 'S'], text: 'shortcutSave'},
  {or: [['↑'], ['↓']], text: 'shortcutPickTag'},
  {keys: ['Esc'], text: 'shortcutCloseForm'},
];
const LIBRARY_SHORTCUTS = [
  {keys: ['Ctrl', 'F'], text: 'shortcutFind'},
  {keys: ['Ctrl', 'Enter'], text: 'shortcutSaveEdit'},
  {or: [['Shift', '↓'], ['Shift', '↑']], text: 'shortcutBulkSelect'},
  {or: [['Shift', 'End'], ['Shift', 'Home']], text: 'shortcutBulkEnds'},
  {keys: ['Delete'], text: 'shortcutBulkDelete'},
  {keys: ['Esc'], text: 'shortcutCloseMenu'},
];
const OUTLINER_SHORTCUTS = [
  {keys: ['Enter'], text: 'shortcutOutlineNew'},
  {or: [['Shift', 'Enter'], ['Esc']], text: 'shortcutOutlineNote'},
  {or: [['Tab'], ['Shift', 'Tab']], text: 'shortcutOutlineIndent'},
  {or: [['Alt', 'Shift', '↑'], ['Alt', 'Shift', '↓']], text: 'shortcutOutlineMove'},
  {keys: ['Backspace'], text: 'shortcutOutlineRemove'},
  {keys: ['Ctrl', 'Shift', 'Backspace'], text: 'shortcutOutlineDelete'},
];

function shortcutRow({keys, or = [keys], text}) {
  const row = document.createElement('tr');
  const how = row.insertCell();
  or.forEach((combo, i) => {
    if (i) how.append(' / ');
    combo.forEach((key, j) => {
      if (j) how.append(' + ');
      how.append(element('kbd', '', key));
    });
  });
  row.insertCell().textContent = message(text);
  return row;
}

// the shortcut of the bookmark form as set in the browser: in the card of the form and in the table; Firefox for
// Android has no keyboard shortcuts, so no tables either
function showShortcuts(commands) {
  const keys = commands.find(command => command.name == 'show-bookmark-form')?.shortcut;
  if (keys) {
    // the keys in the text where it says, as <kbd>
    const [before, after = ''] = message('guideShortcut', '%KEYS%').split('%KEYS%');
    $('shortcut').replaceChildren(before, element('kbd', '', keys), after);
    $('shortcut').hidden = false;
  }
  FORM_SHORTCUTS[0].keys = keys ? keys.split('+') : [];
  $('formShortcuts').replaceChildren(...FORM_SHORTCUTS.filter(shortcut => shortcut.keys?.length != 0).map(shortcutRow));
  $('libraryShortcuts').replaceChildren(...LIBRARY_SHORTCUTS.map(shortcutRow));
  $('outlinerShortcuts').replaceChildren(...OUTLINER_SHORTCUTS.map(shortcutRow));
}

(browser.commands?.getAll() ?? Promise.resolve([])).then(showShortcuts).catch(() => showShortcuts([]));

// the bookmarks of the browser: not in Firefox for Android, which has none for add-ons; the menu of a bookmark in
// Firefox only. Shortcuts neither: no keyboard.
browser.runtime.getPlatformInfo?.().then(platform => {
  if (platform.os != 'android') return;
  $('sync').hidden = $('navSync').hidden = true;
  $('shortcuts').hidden = $('navShortcuts').hidden = true;
}).catch(() => {});
$('syncMenuHint').hidden = !browser.runtime.getBrowserInfo;

// seen: the bar in the Swift Library that it's there goes (library-page.js: showGuideNews)
browser.storage.local.set({guideNews: false, guideNewsSeen: true}).catch(() => {});

// ---- the side bar: the section in view marked ----

const sections = [...document.querySelectorAll('main > section.card[id]')];
const sideLinks = [...document.querySelectorAll('#side a')];

function markSection() {
  // the last one whose top is above a third of the window, or the first
  const current = sections.filter(section => section.getBoundingClientRect().top < innerHeight / 3).at(-1) || sections[0];
  sideLinks.forEach(link => link.classList.toggle('selected', !!current && link.hash == '#' + current.id));
}

addEventListener('scroll', markSection, {passive: true});
addEventListener('resize', markSection);
markSection();

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
