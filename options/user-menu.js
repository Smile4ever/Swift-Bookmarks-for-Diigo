// The menu of your name at the top right of the Swift pages: your account on diigo.com, and only that, said so in its
// heading, each item with ↗ (swift-nav.css) as it leads to diigo.com. Diigo's Help and Support aren't here: they are
// about Diigo, not about these pages (Swift Guide is); nor Discover, which is in the menu at the top. A click on the
// name opens it; a click on an item, next to the menu, or Esc closes it (showMainNav of each page calls showUserMenu).

// where each leads; name: who is signed in. Settings and Sign Out as diigo.com has them (November 2026: /setting,
// /sign-out).
const USER_MENU = [
  // through your library: /profile/<name> loaded as a page is Diigo's old classic one (diigo-site/public-library.js)
  // through Diigo's own library, also with myLibraryToSwift (settings.js: DIIGO_OWN)
  {key: 'userPublicLibrary', url: name => `https://www.diigo.com/user/${encodeURIComponent(name)}${DIIGO_OWN}#dqa-public-library`},
  {key: 'userSettings', url: () => 'https://www.diigo.com/setting'},
  {key: 'userSignOut', url: () => 'https://www.diigo.com/sign-out'},
];

function openUserMenu(open) {
  const menu = document.getElementById('userMenu');
  menu.classList.toggle('open', open);
  document.getElementById('userLink').setAttribute('aria-expanded', String(open));
  if (open) menu.querySelector('.user-menu-items a')?.focus();
}

// the name and its menu, only while someone is signed in; before them the way to diigo.com: your library there
// (Diigo's own, as Ctrl+click on My Library opens it) or, signed out, its home page
function showUserMenu(name) {
  const toDiigo = document.getElementById('toDiigo');
  toDiigo.textContent = browser.i18n.getMessage('toDiigo');
  toDiigo.href = name ? `https://www.diigo.com/user/${encodeURIComponent(name)}${DIIGO_OWN}` : 'https://www.diigo.com/';
  document.getElementById('userMenu').hidden = !name;
  document.getElementById('userName').textContent = name;
  const head = document.createElement('span');
  head.className = 'user-menu-head';
  head.textContent = browser.i18n.getMessage('userMenuHead');
  document.getElementById('userMenuItems').replaceChildren(head, ...USER_MENU.map(item => {
    const link = document.createElement('a');
    link.href = item.url(name);
    link.textContent = browser.i18n.getMessage(item.key);
    link.setAttribute('role', 'menuitem');
    return link;
  }));
}

document.getElementById('userLink').addEventListener('click', () =>
  openUserMenu(!document.getElementById('userMenu').classList.contains('open')));
document.getElementById('userMenuItems').addEventListener('click', e => e.target.closest('a') && openUserMenu(false));
document.addEventListener('click', e => !document.getElementById('userMenu').contains(e.target) && openUserMenu(false));
document.getElementById('userMenu').addEventListener('keydown', e => {
  const menu = document.getElementById('userMenu');
  if (!menu.classList.contains('open')) return;
  const items = [...menu.querySelectorAll('.user-menu-items a')];
  const at = items.indexOf(document.activeElement);
  if (e.key == 'Escape') {
    openUserMenu(false);
    document.getElementById('userLink').focus();
  } else if (e.key == 'ArrowDown' || e.key == 'ArrowUp') {
    items[(at + (e.key == 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  } else {
    return;
  }
  e.preventDefault();
});
