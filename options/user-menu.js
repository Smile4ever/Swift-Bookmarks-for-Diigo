// The menu of your name at the top right of the Swift Library and Swift Discover, as on diigo.com: a click on the name
// opens it, with Diigo's items by their names on the site (in English, like the site), Discover leading to Swift
// Discover as in the menu at the top. A click on an item, next to the menu, or Esc closes it. Shared by library.html and
// discover.html (library-side.js and discover.js: showMainNav call showUserMenu).

// where each leads; name: who is signed in. Settings, Support and Sign Out as diigo.com has them (November 2026:
// /setting, /common/contact, /sign-out; /help leads to help.diigo.com).
const USER_MENU = [
  // through your library: /profile/<name> loaded as a page is Diigo's old classic one (diigo-site/public-library.js)
  {label: 'Public Library', url: name => `https://www.diigo.com/user/${encodeURIComponent(name)}#dqa-public-library`},
  {label: 'Settings', url: () => 'https://www.diigo.com/setting'},
  {label: 'Support', url: () => 'https://www.diigo.com/common/contact'},
  {label: 'Swift Discover', url: () => 'discover.html'},
  {label: 'Help', url: () => 'https://www.diigo.com/help'},
  {label: 'Sign Out', url: () => 'https://www.diigo.com/sign-out'},
];

function openUserMenu(open) {
  const menu = document.getElementById('userMenu');
  menu.classList.toggle('open', open);
  document.getElementById('userLink').setAttribute('aria-expanded', String(open));
  if (open) menu.querySelector('.user-menu-items a')?.focus();
}

// the name and its menu, only while someone is signed in
function showUserMenu(name) {
  document.getElementById('userMenu').hidden = !name;
  document.getElementById('userName').textContent = name;
  document.getElementById('userMenuItems').replaceChildren(...USER_MENU.map(item => {
    const link = document.createElement('a');
    link.href = item.url(name);
    link.textContent = item.label;
    link.setAttribute('role', 'menuitem');
    // Swift Discover from Swift Discover: the page itself
    if (link.href == location.href.split('#')[0]) link.setAttribute('aria-current', 'page');
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
