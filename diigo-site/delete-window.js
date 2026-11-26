// Diigo's delete window: what it deletes goes to the trash of the Swift Library.

// its title and URL; also its link_id (from the link to its page, /user/<name>/b/<link_id>) and tags, for the trash
function describeItem(item) {
  const link = item.querySelector('.ItemTitle a.content');
  const page = [...item.querySelectorAll('a[href*="/b/"]')].map(a => a.pathname.match(/\/b\/(\d+)/)?.[1]).find(Boolean);
  const tags = [...item.querySelectorAll('.tags .Tag .wrapper')].map(el => el.title).filter(Boolean);
  return {title: link?.textContent.trim() || '', url: link?.href || '', linkId: page || '', tags};
}


// ---- the trash: what Diigo's delete window deletes, a copy of it in the trash of the Swift Library ----

// Picked when Delete is clicked (in the ⋮ menu of a bookmark, or the 🗑 of Bulk Edit); nothing is asked of Diigo then,
// so Cancel leaves the items as they were. Only once DELETE is clicked: that click is held back while background.js
// gets the file of each image and PDF (keepFiles, which answers once it has them, or after KEEP_WAIT), as Diigo deletes
// them at once after it; then the click goes on to Diigo, and the copies go to the trash (trashItems): from the index
// of the Swift Library when the item is in it, else what the page shows of it.
const KEEP_WAIT = 45000;
let toTrash = [];
let passing = false;  // the click on DELETE given back to Diigo, not held again
// DELETE was clicked and the files are being got: the window can't be closed now (Esc, Cancel, a click beside it), as
// what was asked of Diigo for the files is only right for items that are then deleted; you said Delete already
let busy = false;

document.addEventListener('keydown', e => {
  if (busy && e.key == 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}, true);

document.addEventListener('click', e => {
  if (busy && !passing) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  const menuItem = e.target.closest?.('.ListItem .menu .menu-item');
  if (menuItem?.textContent.trim() == 'Delete') {
    toTrash = [describeItem(menuItem.closest('.ListItem'))];
  } else if (e.target.closest?.('.MultiActionBar .action-btn .trash')) {
    toTrash = [...document.querySelectorAll('.ListItem.checked')].map(describeItem);
  } else if (e.target.closest?.('.deleteItem .confirm') && toTrash.length && !passing) {
    e.preventDefault();
    e.stopImmediatePropagation();
    confirmDelete(e.target.closest('.deleteItem .confirm'));
  }
}, true);

async function confirmDelete(button) {
  const items = toTrash;
  toTrash = [];
  // busy: the button shows it, and the window stays open till Diigo has it (busy)
  busy = true;
  let clicked = false;
  button.style.cursor = 'wait';
  button.style.opacity = '.6';
  try {
    await Promise.race([
      browser.runtime.sendMessage({type: 'keepFiles', items}).catch(() => {}),
      new Promise(resolve => setTimeout(resolve, KEEP_WAIT)),
    ]);
  } finally {
    button.style.cursor = button.style.opacity = '';
    passing = true;
    try {
      // Diigo deletes them now; the page changed meanwhile (seldom): nothing to click, nothing to the trash
      if (button.isConnected) {
        button.click();
        clicked = true;
      }
    } finally {
      passing = false;
      busy = false;
    }
  }
  if (clicked) browser.runtime.sendMessage({type: 'trash', items}).catch(() => {});
}
