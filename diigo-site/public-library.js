// Public Library from the pages of the add-on (pages/user-menu.js). Diigo's library opens /profile/<name> in its
// React app itself (a Link in the menu of your name), without loading a page: loaded as a page, the server gives the
// old classic one instead. So the add-on leads to your library, /user/<name>#dqa-public-library, and here the link of
// that menu is clicked, as you would, once the library has drawn it. Diigo changed its menu and there is none after a
// while: /profile/<name> as a page after all.

const PUBLIC_LIBRARY_HASH = '#dqa-public-library';
const PUBLIC_LIBRARY_WAIT = 10000;

function openPublicLibrary() {
  const name = location.pathname.match(/^\/user\/([^/]+)\/?$/)?.[1];
  if (location.hash != PUBLIC_LIBRARY_HASH || !name) return;
  // the mark out of the address, so going back or reloading is your library as usual
  history.replaceState(history.state, '', location.pathname + location.search);
  const path = '/profile/' + name;
  const click = () => {
    const link = [...document.querySelectorAll('a[href]')].find(a => a.getAttribute('href') == path);
    link?.click();
    return !!link;
  };
  if (click()) return;
  const watch = new MutationObserver(() => {
    if (!click()) return;
    watch.disconnect();
    clearTimeout(timer);
  });
  watch.observe(document.documentElement, {childList: true, subtree: true});
  const timer = setTimeout(() => {
    watch.disconnect();
    location.assign(path);
  }, PUBLIC_LIBRARY_WAIT);
}

openPublicLibrary();
