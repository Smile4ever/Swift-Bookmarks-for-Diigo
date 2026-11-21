// Diigo's delete window: what it deletes goes to the trash of the Swift Library.

// its title and URL; also its link_id (from the link to its page, /user/<name>/b/<link_id>) and tags, for the trash
function describeItem(item) {
  const link = item.querySelector('.ItemTitle a.content');
  const page = [...item.querySelectorAll('a[href*="/b/"]')].map(a => a.pathname.match(/\/b\/(\d+)/)?.[1]).find(Boolean);
  const tags = [...item.querySelectorAll('.tags .Tag .wrapper')].map(el => el.title).filter(Boolean);
  return {title: link?.textContent.trim() || '', url: link?.href || '', linkId: page || '', tags};
}


// ---- the trash: what Diigo's delete window deletes, a copy of it in the trash of the Swift Library ----

// Picked when Delete is clicked (in the ⋮ menu of a bookmark, or the 🗑 of Bulk Edit), sent to background.js
// (trashItems) once DELETE is: it keeps a copy, from the index of the Swift Library when the bookmark is in it, else
// what the page shows of it. The file of an image or a PDF is asked for already when Delete is clicked (keepFiles), as
// Diigo deletes it once DELETE is.
let toTrash = [];

document.addEventListener('click', e => {
  const menuItem = e.target.closest?.('.ListItem .menu .menu-item');
  if (menuItem?.textContent.trim() == 'Delete') {
    toTrash = [describeItem(menuItem.closest('.ListItem'))];
    browser.runtime.sendMessage({type: 'keepFiles', items: toTrash}).catch(() => {});
  } else if (e.target.closest?.('.MultiActionBar .action-btn .trash')) {
    toTrash = [...document.querySelectorAll('.ListItem.checked')].map(describeItem);
    browser.runtime.sendMessage({type: 'keepFiles', items: toTrash}).catch(() => {});
  } else if (e.target.closest?.('.deleteItem .confirm') && toTrash.length) {
    browser.runtime.sendMessage({type: 'trash', items: toTrash}).catch(() => {});
    toTrash = [];
  }
}, true);
