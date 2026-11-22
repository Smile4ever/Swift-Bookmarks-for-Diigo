// Swift Options (options.html), also the options page in the extension settings of the browser: a field per setting of
// options/settings.js, saved as soon as it changes. A page of the add-on as the others, with the menu at the top
// (showMainNav, which follows the menu as you change it here), a box to find an option (findOption) and the side bar
// marking the section in view (markSection).

// message: library-index.js, loaded before this one for the index (indexFromOptions)
const $ = id => document.getElementById(id);

document.documentElement.lang = browser.i18n.getUILanguage();
for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = message(el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', message(el.dataset.i18nLabel));
document.title += ' - Swift Bookmarks for Diigo';
document.getElementById('find').placeholder = message('optionsFind');

let user = '';  // signed in on diigo.com, for the menu at the top and your name


// ---- the menu at the top, as in the Swift Library (library-side.js: showMainNav), from the menu as set below ----

const MENU_LINKS = {
  // Diigo's own, also with myLibraryToSwift (settings.js: DIIGO_OWN)
  library: () => ({label: message('diigoMyLibrary'), url: `https://www.diigo.com/user/${encodeURIComponent(user)}${DIIGO_OWN}`}),
  outliners: () => ({label: message('diigoMyOutliners'), url: 'https://www.diigo.com/outliner'}),
  groups: () => ({label: message('diigoMyGroups'), url: 'https://groups.diigo.com'}),
  tools: () => ({label: menuName('toolsMenu'), url: 'tools.html'}),
  // Swift Guide, the guide of the add-on, in the place of Diigo's Learn more (guide.html)
  learnMore: () => ({label: menuName('guideMenu'), url: 'guide.html'}),
  premium: () => ({label: message('diigoPremium'), url: 'https://www.diigo.com/premium'}),
  fastLibrary: () => ({label: menuName('libraryMenu'), url: 'library.html'}),
  discover: () => ({label: menuName('discoverMenu'), url: 'discover.html'}),
  // this page itself
  options: () => ({label: menuName('optionsMenu'), url: location.pathname, here: true}),
};

function showMainNav() {
  document.getElementById('mainNav').replaceChildren(...swiftNavItems().map(item => {
    // a link of your own, once it has a web address
    let link = MENU_LINKS[item.id]?.();
    if (!link && /^https?:\/\/./i.test(item.url || '')) {
      try {
        link = {label: item.label.trim() || new URL(item.url).hostname, url: item.url};
      } catch (e) {
        return null;
      }
    }
    if (!link) return null;
    const li = document.createElement('li');
    li.classList.toggle('active', !!link.here);
    const a = document.createElement('a');
    a.href = link.url;
    a.textContent = link.label;
    li.append(a);
    return li;
  }).filter(Boolean));
  // your name and its menu, as on diigo.com (user-menu.js)
  showUserMenu(user);
}

browser.runtime.sendMessage({type: 'user'}).catch(() => '').then(name => {
  user = name || '';
  showMainNav();
  openIndex().then(showIndexState);
});

// signed out, in or as someone else on diigo.com meanwhile (background.js: setUser)
browser.runtime.onMessage.addListener(request => {
  if (request?.type != 'userChanged' || request.user == user) return;
  user = request.user || '';
  showMainNav();
  showIndexState();
});


// ---- the index of the Swift Library: Update and Build again, as ≡ in the Swift Library had them ----

// Done here with the code of the Swift Library itself (library-index.js: updateIndex, buildIndex); an open Swift
// Library or Swift Discover reads the index again after it (indexChanged), as after a save elsewhere.
let indexing = null;  // the AbortController while it updates or builds

function showIndexState(text) {
  const ready = indexReady(user);
  $('indexStatus').textContent = text || indexStatusText(user) +
    (indexProblem ? ' ' + message('indexUnavailable', indexProblem.message || String(indexProblem)) : '');
  $('indexStatus').classList.remove('error');
  $('indexUpdate').hidden = !ready || !!indexing;
  $('indexBuild').hidden = !!indexing;
  $('indexBuild').textContent = message(ready ? 'indexRebuild' : 'indexBuild');
  $('indexBuild').disabled = !user;
  $('indexStop').hidden = !indexing;
}

async function indexFromOptions(work) {
  if (indexing || !user) return;
  indexing = new AbortController();
  showIndexState(message('setupStarting'));
  let failed = '';
  let said = '';
  try {
    // built: how many went to the trash as Diigo no longer has them (library-index.js: buildIndex)
    const {gone} = await work(indexing.signal) || {};
    if (gone) said = message('indexGoneToTrash', String(gone));
    browser.runtime.sendMessage({type: 'indexChanged'}).catch(() => {});
  } catch (e) {
    failed = indexing.signal.aborted ? message('indexStopped') : e?.message || String(e);
  } finally {
    indexing = null;
    showIndexState();
    if (failed) {
      $('indexStatus').textContent = failed;
      $('indexStatus').classList.add('error');
    } else if (said) {
      $('indexStatus').textContent = said;
    }
  }
}

// far fewer items than before (library-index.js: SHRINK_LIMIT): only after a question
const buildFromOptions = () => indexFromOptions(signal =>
  buildIndex(user, signal, (pages, of) => showIndexState(message('indexBuilding', [String(pages), String(of)])),
    {allowShrink: (count, before) => confirm(message('indexShrinkConfirm', [String(count), String(before)]))})
    .then(gone => ({gone})));
// without an index to bring up to date (none yet, of an older version or of someone else): built
const updateFromOptions = () => !meta?.newest || !indexReady(user) ? buildFromOptions() : indexFromOptions(signal =>
  updateIndex(signal, page => showIndexState(message('indexUpdating', String(page)))));

$('indexUpdate').addEventListener('click', updateFromOptions);
$('indexBuild').addEventListener('click', buildFromOptions);
$('indexStop').addEventListener('click', () => indexing?.abort());

// changed elsewhere (a save on diigo.com, the Swift Library): what it says now
browser.runtime.onMessage.addListener(request => {
  if (request?.type != 'indexChanged' || indexing) return;
  db?.close();
  openIndex().then(() => showIndexState());
});


// ---- finding an option: the sections, and the options in them, with each word typed in their text ----

const sections = [...document.querySelectorAll('main > section.card')];
const sideLinks = [...document.querySelectorAll('#side a')];
const words = text => text.toLowerCase().split(/\s+/).filter(Boolean);

function findOption() {
  const wanted = words(document.getElementById('find').value);
  const fits = el => wanted.every(word => el.textContent.toLowerCase().includes(word));
  let found = 0;
  for (const section of sections) {
    const heading = section.querySelector('h1');
    // the section by its name: all of it; else only the options that fit, and the rest of it while one does
    const whole = !wanted.length || (heading && fits(heading));
    const options = [...section.querySelectorAll('.option')];
    options.forEach(option => option.hidden = !whole && !fits(option));
    const shown = whole || fits(section);
    section.hidden = !shown;
    if (shown) found++;
    sideLinks.filter(link => link.hash == '#' + section.id).forEach(link => link.hidden = !shown);
  }
  document.getElementById('findNone').hidden = found > 0;
  markSection();
}

document.getElementById('find').addEventListener('input', findOption);
document.getElementById('findForm').addEventListener('submit', e => {
  e.preventDefault();
  sections.find(section => !section.hidden)?.scrollIntoView();
});
// Ctrl+F (Cmd+F on a Mac): the box, as in the Swift Library; again there, the find bar of the browser
document.addEventListener('keydown', e => {
  if (e.key.toLowerCase() != 'f' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
  const find = document.getElementById('find');
  if (document.activeElement == find) return;
  e.preventDefault();
  find.focus();
  find.select();
});


// ---- the side bar: the section in view marked, as the view chosen in the side bar of the Swift Library ----

function markSection() {
  const shown = sections.filter(section => !section.hidden);
  // the last one whose top is above a third of the window, or the first
  const current = shown.filter(section => section.getBoundingClientRect().top < innerHeight / 3).at(-1) || shown[0];
  sideLinks.forEach(link => link.classList.toggle('selected', !!current && link.hash == '#' + current.id));
}

addEventListener('scroll', markSection, {passive: true});
addEventListener('resize', markSection);
markSection();

// ---- shortcuts: the keys and what they do ----

const FORM_SHORTCUTS = [
  {keys: [], text: 'shortcutOpenForm'},  // the keys come from the browser: you can change them
  {keys: ['Enter'], text: 'shortcutSaveFromTags'},
  {keys: ['Ctrl', 'S'], text: 'shortcutSave'},
  {keys: ['↑', '↓'], sep: ' / ', text: 'shortcutPickTag'},
  {keys: ['Esc'], text: 'shortcutCloseForm'},
];

function shortcutRow({keys, sep = ' + ', text}) {
  const row = document.createElement('tr');
  const how = row.insertCell();
  keys.forEach((key, i) => {
    if (i) how.append(sep);
    const kbd = document.createElement('kbd');
    kbd.textContent = key;
    how.append(kbd);
  });
  row.insertCell().textContent = browser.i18n.getMessage(text);
  return row;
}

// Firefox for Android has no shortcuts
(browser.commands?.getAll() ?? Promise.resolve([])).then(commands => {
  const openForm = commands.find(c => c.name == 'show-bookmark-form')?.shortcut;
  FORM_SHORTCUTS[0].keys = openForm ? openForm.split('+') : [];
  document.getElementById('formShortcuts').append(...FORM_SHORTCUTS.map(shortcutRow));
});


loadSettings().then(settings => {
  // one tag per line
  const hiddenTags = document.getElementById('hiddenTags');
  hiddenTags.value = settings.hiddenTags.join('\n');
  hiddenTags.placeholder = browser.i18n.getMessage('optionsTagsExample');
  hiddenTags.addEventListener('input', () => {
    const tags = hiddenTags.value.split('\n').map(tag => tag.trim()).filter(Boolean);
    saveSettings({hiddenTags: [...new Set(tags)]});
  });

  for (const [key, value] of Object.entries(settings)) {
    if (typeof value != 'boolean') continue;
    // a setting set elsewhere has no switch here
    const box = document.getElementById(key);
    if (!box) continue;
    box.checked = value;
    box.addEventListener('change', () => saveSettings({[key]: box.checked}));
  }
  // what the toolbar button opens: a choice of two, not a switch
  const toolbarButton = document.getElementById('toolbarButton');
  toolbarButton.value = settings.toolbarButton;
  toolbarButton.addEventListener('change', () => saveSettings({toolbarButton: toolbarButton.value}));
  // checking links by themselves only counts with the status of links shown
  document.getElementById('deadLinks').addEventListener('change', followDeadLinks);
  followDeadLinks();

  showSync(settings);
  showMainNav();
  siteRules = settings.siteRules;
  showSiteRules();
});


const followDeadLinks = () =>
  document.getElementById('autoCheckLinks').disabled = !document.getElementById('deadLinks').checked;

// Firefox: the settings go to other computers only with Add-ons ticked in Firefox Sync
document.getElementById('privacyFirefoxSync').hidden = !browser.runtime.getBrowserInfo;

// Changed on another computer (storage.sync), while this page is open: what it shows follows, so a click here doesn't
// put back what was there. Not what you are typing in or editing (a field of it has the focus): that wins when it is
// saved. What this page saves itself comes back here too, the same, and changes nothing.
const same = (a, b) => JSON.stringify(a) == JSON.stringify(b);
const editing = id => document.getElementById(id).contains(document.activeElement);

browser.storage.onChanged.addListener(async (changes, area) => {
  if (area != 'sync' || !Object.keys(changes).some(key => SYNCED_SETTINGS.includes(key))) return;
  const settings = await loadSettings().catch(() => null);
  if (!settings) return;
  for (const [key, value] of Object.entries(settings)) {
    const box = typeof value == 'boolean' && document.getElementById(key);
    if (box && box.checked != value) box.checked = value;
  }
  followDeadLinks();
  if (!editing('toolbarButton')) document.getElementById('toolbarButton').value = settings.toolbarButton;
  const hiddenTags = document.getElementById('hiddenTags');
  const typed = [...new Set(hiddenTags.value.split('\n').map(tag => tag.trim()).filter(Boolean))];
  if (!editing('hiddenTags') && !same(typed, settings.hiddenTags)) hiddenTags.value = settings.hiddenTags.join('\n');
  if (!editing('siteRules') && !same(siteRules, settings.siteRules)) {
    siteRules = settings.siteRules;
    showSiteRules();
  }
});


// ---- rules per site, for a new bookmark in the bookmark form (form/form.js: siteRulesFor) ----

let siteRules = [];  // siteRules of options/settings.js

const saveSiteRules = () => saveSettings({siteRules});

// tags separated by spaces or commas, "between quotes" when there's a space in one; as in form/form.js
const splitTags = text => [...new Set((text.match(/"[^"]*"?|[^\s,"]+/g) || [])
  .map(tag => tag.replace(/"/g, '').trim()).filter(Boolean))];
const joinTags = tags => tags.map(tag => /[\s,]/.test(tag) ? `"${tag}"` : tag).join(' ');

// as usual (null), or true or false
function ruleChoice(rule, key, texts) {
  const select = document.createElement('select');
  select.setAttribute('aria-label', message(texts[0]));
  texts.forEach((text, i) => select.append(new Option(message(text), ['', 'yes', 'no'][i])));
  select.value = rule[key] === true ? 'yes' : rule[key] === false ? 'no' : '';
  select.addEventListener('change', () => {
    rule[key] = select.value ? select.value == 'yes' : null;
    saveSiteRules();
  });
  return select;
}

function siteRuleRow(rule, i) {
  const row = document.createElement('li');
  const field = (className, value, placeholder, onInput) => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = className;
    input.value = value;
    input.placeholder = placeholder;
    input.spellcheck = false;
    input.setAttribute('aria-label', placeholder);
    input.addEventListener('input', () => {
      onInput(input.value);
      saveSiteRules();
    });
    return input;
  };
  // a web address on the site works too: its site is kept
  const site = field('rule-site', rule.site, message('siteRulesSite'), value => {
    let host = value.trim().toLowerCase();
    try {
      host = new URL(/^[a-z]+:\/\//.test(host) ? host : 'https://' + host).hostname;
    } catch (e) {
    }
    rule.site = host.replace(/^www\./, '');
  });
  const tags = field('rule-tags', joinTags(rule.tags || []), message('siteRulesTags'), value => {
    rule.tags = splitTags(value);
  });
  row.append(site, tags,
    ruleChoice(rule, 'private', ['ruleAsUsualPrivacy', 'private', 'rulePublic']),
    ruleChoice(rule, 'unread', ['ruleAsUsualUnread', 'readLater', 'ruleNotReadLater']),
    topMenuButton('✕', 'topMenuRemove', () => {
      siteRules.splice(i, 1);
      saveSiteRules();
      showSiteRules();
    }));
  return row;
}

function showSiteRules() {
  $('siteRules').replaceChildren(...siteRules.map(siteRuleRow));
}

document.getElementById('siteRulesAdd').addEventListener('click', () => {
  siteRules.push({site: '', tags: [], private: null, unread: null});
  saveSiteRules();
  showSiteRules();
  $('siteRules').lastElementChild.querySelector('.rule-site').focus();
});


// a small button of a row (rules per site): its text, its title (a text of the add-on) and what it does
function topMenuButton(text, title, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.title = message(title);
  button.setAttribute('aria-label', message(title));
  button.addEventListener('click', action);
  return button;
}


// ---- bookmarks of the browser to Diigo, done by background/sync.js ----

let chosenFolders = new Set();

const hasBookmarks = () => browser.permissions.contains({permissions: ['bookmarks']}).catch(() => false);
const bookmarkCount = node => node.url ? 1 : (node.children || []).reduce((n, child) => n + bookmarkCount(child), 0);

// a folder and its subfolders; separators and bookmarks have no children
function folderItem(node) {
  const item = document.createElement('li');
  const label = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.value = node.id;
  box.addEventListener('change', () => {
    box.checked ? chosenFolders.add(node.id) : chosenFolders.delete(node.id);
    markFolders();
    // a folder in a chosen folder comes along with it, so it isn't kept on its own
    const own = [...$('syncTree').querySelectorAll('input:not(:disabled)')].filter(box => box.checked).map(box => box.value);
    saveSettings({syncFolders: own});
  });
  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = ` (${bookmarkCount(node)})`;
  label.append(box, node.title || '—', count);
  item.append(label);
  const folders = (node.children || []).filter(child => child.children);
  if (folders.length) {
    const list = document.createElement('ul');
    list.append(...folders.map(folderItem));
    item.append(list);
  }
  return item;
}

// a folder in a checked folder is checked and can't be unchecked; in document order, so a parent is done before its folders
function markFolders() {
  for (const box of $('syncTree').querySelectorAll('input')) {
    const parent = box.closest('ul').closest('li')?.querySelector(':scope > label > input');
    box.disabled = !!parent?.checked;
    box.checked = box.disabled || chosenFolders.has(box.value);
  }
}

function showSyncStatus(status) {
  const text = $('syncStatus');
  if (!status) return text.textContent = '';
  if (status.signedOut) return text.textContent = message('syncSignedOut');
  if (!status.saved && !status.skipped && !status.failed && !status.left) return text.textContent = message('syncNothing');
  const counts = [status.saved, status.skipped, status.failed, status.left].map(String);
  text.textContent = message('syncStatus', counts);
}

async function showSync(settings) {
  const platform = await browser.runtime.getPlatformInfo();
  // and its link at the side
  if (platform.os == 'android') return $('sync').hidden = $('navSync').hidden = true;
  const allowed = await hasBookmarks();
  $('syncAllow').hidden = allowed;
  $('syncSettings').hidden = !allowed;
  if (!allowed) return;
  // the menu of a bookmark is in Firefox only
  $('syncMenuHint').hidden = !browser.runtime.getBrowserInfo;
  chosenFolders = new Set(settings.syncFolders);
  const [root] = await browser.bookmarks.getTree();
  $('syncTree').replaceChildren(...root.children.filter(child => child.children).map(folderItem));
  markFolders();
  showSyncStatus((await browser.storage.local.get('syncStatus')).syncStatus);
}

// asked for in the click itself: Firefox only shows the question for something the user just did
$('syncAllow').addEventListener('click', () => {
  browser.permissions.request({permissions: ['bookmarks']}).then(granted => granted && loadSettings().then(showSync));
});

$('syncNow').addEventListener('click', async () => {
  if (!chosenFolders.size) return $('syncStatus').textContent = message('syncNoFolders');
  // the counts come in through storage, from background/sync.js
  const queued = await browser.runtime.sendMessage({type: 'syncNow'});
  if (queued == 'signedOut') $('syncStatus').textContent = message('syncSignedOut');
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area == 'local' && changes.syncStatus) showSyncStatus(changes.syncStatus.newValue);
});
