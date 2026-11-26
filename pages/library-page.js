// A part of the Swift Library (library.html); library.js has what they share, library-page.js puts them to work.

// ---- the page ----

// Ctrl+F (Cmd+F on a Mac): the search box, with what is typed in it selected, instead of the find bar of the browser.
// Again in the search box, or in a popup or dialog, the find bar of the browser after all. The same in Swift Discover.
function findKey(e) {
  if (e.key.toLowerCase() != 'f' || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
  if (document.activeElement == $('query') || document.querySelector('dialog[open]')) return;
  e.preventDefault();
  $('query').focus();
  $('query').select();
}

let typing = 0;
$('query').addEventListener('input', () => {
  clearTimeout(typing);
  showPin();
  typing = setTimeout(() => {
    state.random = '';
    state.query = $('query').value.trim();
    show();
  }, 150);
});
autocomplete($('query'), () => SUGGESTIONS[state.field] && state.field);
$('searchForm').addEventListener('submit', e => {
  e.preventDefault();
  clearTimeout(typing);
  state.random = '';
  state.query = $('query').value.trim();
  show();
});
$('field').addEventListener('change', () => chooseField($('field').value));
$('pin').title = message('libraryPin');
$('pin').setAttribute('aria-label', message('libraryPin'));
$('pin').addEventListener('click', pinSearch);
$('emptyTrash').addEventListener('click', emptyTrash);
$('tickDuplicates').addEventListener('click', tickDuplicates);
// Without a title: all of those shown (library-edit.js)
$('fetchTitles').addEventListener('click', () => fetchTitles(shown));
$('checkAllLinks').addEventListener('click', checkAllLinks);
$('huntDeadLinks').addEventListener('click', huntDeadLinks);
$('privacy').addEventListener('change', () => {
  state.privacy = $('privacy').value;
  state.random = '';
  show();
});
$('saved').addEventListener('change', () => {
  state.saved = $('saved').value;
  state.random = '';
  show();
});
$('showHidden').addEventListener('change', () => {
  state.showHidden = $('showHidden').checked;
  state.random = '';
  show();
});
$('sort').addEventListener('change', () => {
  state.sort = $('sort').value;
  show();
});
$('cloudClose').addEventListener('click', () => $('cloudDialog').close());
$('similarClose').addEventListener('click', () => $('similarDialog').close());
$('cloudFind').placeholder = message('libraryTagFilter');
$('cloudFind').addEventListener('input', () => safely('all tags', fillCloud));
$('cloudHidden').addEventListener('change', () => safely('all tags', fillCloud));
$('add').addEventListener('click', () => openAddMenu(!$('addMenu').classList.contains('open')));
addTypes.addEventListener('click', e => e.target.dataset.add && addItem(e.target.dataset.add));
$('addMenu').addEventListener('keydown', e => {
  if (e.key != 'Escape' || !$('addMenu').classList.contains('open')) return;
  openAddMenu(false);
  $('add').focus();
});
document.addEventListener('click', e => !$('addMenu').contains(e.target) && openAddMenu(false));
// a file dropped next to the box for it would open in place of this page
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => e.preventDefault());
$('indexBuildNow').addEventListener('click', build);
// the first time (library.js: showSetup): Try again or Build index, and Stop
$('setupBuild').addEventListener('click', () => !controller && build());
$('setupStop').addEventListener('click', () => {
  stopped = true;
  controller?.abort();
});
$('noticeClose').addEventListener('click', () => showStatus(''));
$('stop').addEventListener('click', () => {
  stopped = true;
  controller?.abort();
});
$('bulkToggle').addEventListener('click', () => {
  state.bulk = !state.bulk;
  show({push: true, keepScroll: true});
});
watchBulkBar();
document.addEventListener('keydown', shiftKey);
document.addEventListener('keydown', deleteKey);
document.addEventListener('keydown', findKey);
$('toastUndo').addEventListener('click', undoDelete);
$('toastTrash').addEventListener('click', () => {
  $('toast').hidden = true;
  setView('trash');
});
// changes to an outliner not on Diigo yet (library-outliners.js): the browser asks first when the page goes. Not for
// items or outliners waiting to be deleted: those are kept and deleted the next time (library-delete.js: keepPending,
// resumePending; library-outliners.js: keepWaiting, resume).
addEventListener('beforeunload', e => outlinerPart.unsaved() && e.preventDefault());
// the menu of the archives (library-links.js): closed by a click elsewhere, Esc, or the list drawn again
document.addEventListener('pointerdown', e => archiveMenu && !archiveMenu.contains(e.target) &&
  e.target != archiveMenu.owner && closeArchiveMenu(), true);
document.addEventListener('keydown', e => e.key == 'Escape' && closeArchiveMenu());
$('bulkAll').addEventListener('change', () => {
  chosen = new Set($('bulkAll').checked ? shown.map(item => item.id) : []);
  $('items').querySelectorAll('.pick').forEach(box => box.checked = $('bulkAll').checked);
  showPicked();
});
$('bulkTags').placeholder = message('bulkTagsHint');
$('bulkTags').addEventListener('input', showPicked);
autocomplete($('bulkTags'), 'tag');
$('bulkTags').addEventListener('keydown', e => {
  // not when Enter took a suggestion (autocomplete)
  if (e.key == 'Enter' && !e.defaultPrevented) editTags();
});
$('bulkApplyTags').addEventListener('click', editTags);
$('bulkRead').addEventListener('click', () =>
  editPicked($('bulkRead').textContent, {type: toggles(pickedItems()).read}));
// Make public asks first: everyone can see them then; Make private doesn't need to
$('bulkPrivacy').addEventListener('click', async () => {
  const type = toggles(pickedItems()).privacy;
  if (type == 'public' && !await askConfirm(message('bulkPublicConfirm', String(pickedItems().length)), {danger: true})) return;
  editPicked($('bulkPrivacy').textContent, {type});
});
$('bulkStop').addEventListener('click', () => {
  stopped = true;
  controller?.abort();
});
$('bulkDelete').addEventListener('click', deletePicked);
$('bulkNewUrl').addEventListener('click', newUrlsPicked);
$('bulkRestore').addEventListener('click', restorePicked);
$('bulkForget').addEventListener('click', forgetPicked);
showBulkShare();
addEventListener('popstate', () => {
  loadState();
  show();
});

// Once after the update that brought Swift Guide (background.js: guideNewsOnce): a bar that it's there, gone for good
// with × or once the guide is opened (here or elsewhere: guide.js says guideNewsSeen too)
const forgetGuideNews = () => browser.storage.local.set({guideNews: false, guideNewsSeen: true}).catch(() => {});
async function showGuideNews() {
  const {guideNews} = await browser.storage.local.get('guideNews').catch(() => ({}));
  $('guideNews').hidden = !guideNews;
}
$('guideNewsOpen').addEventListener('click', forgetGuideNews);
$('guideNewsClose').addEventListener('click', () => {
  $('guideNews').hidden = true;
  forgetGuideNews();
});
browser.storage.onChanged.addListener((changes, area) => area == 'local' && changes.guideNews && showGuideNews());
showGuideNews();

// The background script brought the index up to date after a save elsewhere (diigo.com, the bookmark form, the sync of
// bookmarks of the browser): read again, as it is now, so Start (Recently saved) and the list show it at once. While
// building, updating or deleting, which save the index themselves, it is read again once that is done (library.js:
// stop, indexStale), not left till the next change. The list stays as it is while a bookmark is being edited in it.
// Only items that changed: those drawn anew in their place, not the whole page (library-list.js: redrawChanged).
function readIndexAgain() {
  indexStale = false;
  safely('index', async () => {
    const [before, trashBefore] = [index, trash];
    db?.close();
    await openIndex();
    showIndex();
    if ($('main').querySelector('form.edit')) return;
    if (!safely('redraw', () => redrawChanged(before, trashBefore), false)) show({keepScroll: true});
  });
}

browser.runtime.onMessage.addListener(request => {
  if (request?.type != 'indexChanged') return;
  if (controller) indexStale = true;
  else readIndexAgain();
});

// hidden tags, the menu or what Bulk edit does after an action changed on the options page
// links said not to be dead in another tab of the Swift Library (library-links.js: ignoreLink)
browser.storage.onChanged.addListener(async (changes, area) => {
  if (!settingsArea(area) || !changes.ignoredLinks) return;
  await loadIgnoredLinks();
  if (meta?.user == user) show({keepScroll: true});
});

browser.storage.onChanged.addListener(async (changes, area) => {
  const keys = ['hiddenTags', 'todoRandom', 'homeLayout', 'hideScreenshots', 'screenshotThumbs', 'previewThumbs', 'noHiddenThumbs', 'splitAdd', 'bulkExitAfter', 'bulkClearFilters', 'deleteDelay', 'deadLinks',
    'hidePrivateFlag', 'hideShareToOutliner', 'autoCheckLinks', 'checkHiddenLinks'];
  if (!settingsArea(area) || !keys.some(key => changes[key])) return;
  settings = await loadSettings().catch(() => settings);
  // the menus of Share to outliner shown or hidden (library-outliners.js: shareSelect)
  for (const select of document.querySelectorAll('select.share-outliner')) select.fill?.();
  safely('menu', showMainNav);
  document.documentElement.classList.toggle('split-add', !!settings.splitAdd);
  placeAddTypes();
  if ((changes.hiddenTags || changes.deadLinks || changes.hidePrivateFlag || changes.todoRandom || changes.homeLayout ||
    changes.hideScreenshots || changes.screenshotThumbs || changes.previewThumbs || changes.noHiddenThumbs || changes.checkHiddenLinks) && meta?.user == user) show({keepScroll: true});
});

// with an index of who is signed in: shown at once, then updated, which mostly takes one request
// Each of these can fail on its own: without who is signed in, the index is shown as it is; without the settings, with
// the defaults; without the index (openIndex never fails), building it again still works, in this page only.
// the index first, and the status of its pages from it (library-links.js) before the list is drawn
// (and the groups of Similar tags left out, library-tags.js, for Clean up on Start, and the links said not to be dead,
// library-links.js)
Promise.allSettled([
  openIndex().then(() => Promise.all([loadLinkStates(), loadPreviews()])), browser.runtime.sendMessage({type: 'user'}), loadSettings(), loadIgnoredGroups(),
  loadIgnoredLinks(),
]).then(([, name, loaded]) => {
  if (name.status == 'rejected') reportProblem(name.reason, 'user');
  if (loaded.status == 'rejected') reportProblem(loaded.reason, 'settings');
  // signed out on diigo.com is signed out here: no library, Sign in instead (library.js: showSetup); only when the
  // background script didn't answer, the index of whoever it is of
  user = name.status == 'rejected' ? meta?.user || '' : name.value || '';
  settings = loaded.value || DEFAULT_SETTINGS;
  safely('menu', showMainNav);
  document.documentElement.classList.toggle('split-add', !!settings.splitAdd);
  // the + or the five buttons, now that the settings say which (hidden in library.html till then)
  safely('add', placeAddTypes);
  safely('address', loadState);
  // the cursor in the search box, after what the address searches for, so typing searches at once
  safely('search box', () => {
    $('query').focus();
    $('query').setSelectionRange($('query').value.length, $('query').value.length);
  });
  openFor(user);
});

// Signed in: the index shown at once and updated; without one (none yet, of an older version or of someone else)
// built by itself, as you wouldn't do that yourself (library.js: showSetup says how far). Signed out: Sign in.
function openFor(name) {
  safely('index', showIndex);
  // your outliners, for how many there are in the side bar (library-outliners.js)
  if (name) safely('outliners', outlinerPart.ensureList);
  if (name && indexReady(name)) {
    show();
    update();
    // what waited to be deleted when a page of the Swift Library was left (library-delete.js)
    resumePending().catch(e => reportProblem(e, 'delete'));
    outlinerPart.resume().catch(e => reportProblem(e, 'outliners'));
  } else if (name) {
    build();
  }
}

// View the library offline (library.js: showOfflineButton): the index in the browser shown as whose it is (meta.user),
// as it was last kept, without asking Diigo anything (no update, no build, no outliners). Said so in the bar above it;
// what needs Diigo (saving, deleting) fails until you are signed in again, which ends it (userChanged, below).
let offline = false;
$('setupOffline').addEventListener('click', () => {
  if (!meta?.user || meta.version != INDEX_VERSION) return;
  offline = true;
  user = meta.user;
  safely('menu', showMainNav);
  safely('index', showIndex);
  show();
  // stays (not gone after STATUS_TIME), and isn't an error for the log
  showStatus(message('libraryOffline'));
  clearTimeout(statusTimer);
});

// Signed out, in or as someone else on diigo.com meanwhile (background.js: setUser): this page follows. Signed out,
// what it was doing (building, updating, Bulk edit) stops, and the library makes room for Sign in; signed in again, it
// opens as it does when the page opens.
// Offline (openOffline) and then signed in: as a page that opens, the index updated; signed out still: stays offline.
browser.runtime.onMessage.addListener(request => {
  if (request?.type != 'userChanged') return;
  if (offline) {
    if (!request.user) return;
    offline = false;
    showStatus('');
  } else if (request.user == user) {
    return;
  }
  user = request.user || '';
  outlinerPart.reset();
  // the links of who was signed in are no longer to check (library-links.js: checkAllLinks)
  linkCheck?.abort();
  if (controller) {
    stopped = true;
    controller.abort();
  }
  $('popup').open && $('popup').close();
  safely('menu', showMainNav);
  // once what was stopped has ended (its stop() would otherwise end what starts now)
  const open = () => controller ? setTimeout(open, 100) : openFor(user);
  open();
});
