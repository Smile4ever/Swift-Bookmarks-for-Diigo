// A part of the Swift Library (library.html); library.js has what they share, library-page.js puts them to work.

// ---- adding: Diigo's + with its menu, or its five buttons with splitAdd, and a popup over the page for each, as Diigo
// adds (AddHandler: a window over the library), in the look of the bookmark form of the toolbar button (form/form.html)

// The popup (#popup, a dialog) as a card like form/form.html: the heading and × at the top, the fields, what went wrong,
// and the button at the bottom right. Esc, × and a click next to the card close it, but not while busy() (an upload).
function popupCard(headingKey, saveKey, busy = () => false) {
  const dialog = $('popup');
  const card = element('form', 'card');
  const header = element('header');
  const close = element('button', 'close');
  close.type = 'button';
  close.title = message('close');
  close.setAttribute('aria-label', message('close'));
  header.append(element('h1', '', message(headingKey)), close);
  const fields = element('section', 'fields');
  const error = element('p', 'card-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const save = element('button', 'save', message(saveKey));
  save.type = 'submit';
  const footer = element('footer');
  footer.append(save);
  card.append(header, fields, error, footer);

  const shut = () => !busy() && dialog.close();
  close.addEventListener('click', shut);
  // Esc: the cancel of the popup itself, not one that bubbles up to it from the file picker of Add PDF or Add Image,
  // closed without a file (an input of type file fires cancel then, which bubbles)
  dialog.oncancel = e => {
    if (e.target != dialog) return;
    e.preventDefault();
    shut();
  };
  // a block, not `e.target == dialog && shut()`: an on… handler that returns false cancels the click, and so Save
  dialog.onclick = e => {
    if (e.target == dialog) shut();
  };
  dialog.className = 'popup';
  dialog.replaceChildren(card);
  dialog.showModal();
  return {card, fields, error, save, shut};
}

// a field of the popup as in the bookmark form: its name in it while it's empty, above it once there is text
function cardField(key, el) {
  const div = element('div', 'field');
  el.id = 'popup-' + key;
  el.placeholder = ' ';
  const label = element('label', '', message(key));
  label.htmlFor = el.id;
  div.append(el, label);
  return div;
}

// Share to outliner and Share to group, as menus of the popup (addFiles), as the bookmark form has them (form/form.js:
// showSharing): your outliners and groups, which the background script knows (sharingLists); a menu without any is
// hidden. share: both; the group one in a span of its own (.share-group), as it is hidden while private. loaded: called
// once they are filled in.
function sharingSelects(loaded) {
  const share = element('div', 'share');
  const outliner = element('select');
  const group = element('select');
  outliner.append(new Option(message('shareToOutliner'), ''));
  group.append(new Option(message('shareToGroup'), ''));
  outliner.setAttribute('aria-label', message('shareToOutliner'));
  group.setAttribute('aria-label', message('shareToGroup'));
  const groupBox = element('span', 'share-group');
  groupBox.append(group);
  share.append(outliner, groupBox);
  outliner.hidden = groupBox.hidden = true;
  browser.runtime.sendMessage({type: 'sharing'}).then(lists => {
    outliner.append(...(lists?.outliners || []).map(list => new Option(list.title, list.id)));
    group.append(...(lists?.groups || []).map(item => new Option(item.displayName, item.name)));
    // none, or the option hideShareToOutliner (options/settings.js)
    outliner.hidden = outliner.options.length < 2 || !!settings.hideShareToOutliner;
    loaded();
  }).catch(() => {});
  return {share, outliner, group};
}

function cardCheck(key) {
  const label = element('label');
  const box = Object.assign(element('input'), {type: 'checkbox'});
  label.append(box, element('span', '', message(key)));
  const options = element('div', 'options');
  options.append(label);
  return [options, box];
}

// What was added is in the index (library-index.js: postNote, addFile): in the list, and how many in the status line,
// as Diigo says it ("2 images added").
function added(count) {
  show({keepScroll: true});
  showStatus(message('libraryAdded', String(count)));
}

// A bookmark: the bookmark form of the toolbar button itself, in an iframe, with its suggested tags, tag cloud and
// sharing. Without a page to start from, it first asks the URL (form/form.js: askUrl), as Diigo's Add Bookmark window
// does. Diigo's new bookmark comes into the index with the update the background script does after a save
// (refreshIndex, indexChanged).
function addBookmark() {
  const dialog = $('popup');
  const frame = element('iframe');
  frame.src = browser.runtime.getURL('form/form.html');
  dialog.oncancel = null;
  dialog.onclick = e => {
    if (e.target == dialog) dialog.close();
  };
  dialog.className = 'popup framed';
  dialog.replaceChildren(frame);
  dialog.showModal();
  frame.addEventListener('load', () => frame.focus());
}

// from form/form.js in that iframe
addEventListener('message', e => {
  const frame = $('popup').querySelector('iframe');
  if (!frame || e.source != frame.contentWindow) return;
  if (e.data?.type == 'close') $('popup').close();
  // in the list and on Start at once: brought up to date now, without waiting for the background script
  if (e.data?.type == 'saved') {
    showStatus(message('libraryAdded', '1'));
    // the update says how far as it goes: that it was added again once it's done
    if (!controller && meta?.newest && indexReady(user)) update().then(() => showStatus(message('libraryAdded', '1')));
  }
  if (e.data?.type == 'height') frame.style.height = Math.min(e.data.height, innerHeight - 32) + 'px';
});

// A note, as Diigo's app makes a new one (newNote): rich, with its title, text and tags; like Diigo, not an empty one.
// Ctrl+Enter saves from the text too. A title that ends in .py, .css, .html… (library-code.js: codeLanguage) makes the
// text code, in colours, while nothing is typed in it yet; saved in a <pre> (codeNote), as editNote saves code.
function addNote() {
  const {card, fields, error, save} = popupCard('libraryNewNote', 'add');
  const title = input('text', '');
  // with its buttons and as high as the window lets it (library-edit.js: noteEditor)
  const rich = noteEditor();
  let code = null;  // codeEditor, once the title says it's code
  const text = element('div', 'field static');
  text.append(element('span', 'static-label', message('libraryNoteText')), rich.editor);
  $('popup').classList.add('wide');
  const richEmpty = () => !rich.content.textContent.trim() && !rich.content.querySelector('img');
  title.addEventListener('input', () => {
    const language = codeLanguage(title.value);
    if (code && language) return code.setLanguage(language);
    if (!code && language && richEmpty()) {
      code = codeEditor('', language);
      rich.editor.replaceWith(code.editor);
    } else if (code && !language && !code.content.value.trim()) {
      code.editor.replaceWith(rich.editor);
      code = null;
    } else if (code) {
      code.setLanguage('');
    }
  });
  const tags = input('text', '');
  // Share to outliner, as Add Image and Add PDF have it (library-outliners.js: shareSelect, addItems)
  const outliner = outlinerPart.shareSelect();
  const share = element('div', 'share');
  share.append(outliner);
  fields.append(cardField('fieldTitle', title), text, cardField('fieldTags', tags), tagSuggestions(tags, {type: 'note'}, title),
    share);
  card.addEventListener('keydown', e => e.key == 'Enter' && e.ctrlKey && card.requestSubmit());
  card.addEventListener('submit', async e => {
    e.preventDefault();
    const empty = code ? !code.content.value.trim() : richEmpty();
    if (!title.value.trim() && empty) return (code || rich).content.focus();
    save.disabled = true;
    save.textContent = message('saving');
    error.hidden = true;
    const note = await postNote({
      title: title.value.trim(), content: code ? codeNote(code.content.value) : rich.content.innerHTML, rich: true,
      tags: splitTags(tags.value),
    });
    save.disabled = false;
    save.textContent = message('add');
    if (!note) {
      error.textContent = message('libraryNoteNotSaved', diigoAnswer);
      error.hidden = false;
      return;
    }
    // the note is there; not in the outliner, the bar below the blue one says why (addItems)
    if (outliner.value) await outlinerPart.addItems(outliner.value, [note]);
    $('popup').close();
    added(1);
  });
  title.focus();
}

// Images or PDFs, as Diigo's Add Image and Add PDF windows add them (library-index.js: addFile): dropped on the box
// or picked with a click, more at once, each with how far it is, the tags, and for PDFs Read later; private, as there.
// What Diigo doesn't take (another kind of file, a PDF of 64 MB or more) is listed with why. One after the other;
// those Diigo took leave the list, the others stay, to try again.
function addFiles(type) {
  const pdf = type == 'pdf';
  const files = [];  // {file, problem, li, status, remove}: those not taken by Diigo yet
  let busy = false;
  const {card, fields, error, save, shut} = popupCard(pdf ? 'libraryAddPdfTitle' : 'libraryAddImageTitle',
    'libraryUpload', () => busy);
  const picker = Object.assign(element('input'), {
    type: 'file', multiple: true, hidden: true, accept: pdf ? '.pdf,application/pdf' : IMAGE_TYPES.join(','),
  });
  const drop = element('button', 'drop', message(pdf ? 'libraryDropPdfs' : 'libraryDropImages'));
  drop.type = 'button';
  const list = element('ul', 'files');
  const tags = input('text', '');
  // a description too, as Diigo's Add PDF window has it (its Add Image has none: the add-on saves it after the upload,
  // library-index.js: addFile); the same for each of them
  const description = Object.assign(element('textarea'), {rows: 3});
  // share to an outliner or a group, as Diigo's Add PDF and Add Image have it (sharingSelects)
  const {share, outliner, group} = sharingSelects(() => showGroup());
  // private (as Diigo's own windows always make them), and for a PDF read later, side by side
  const [options, privateBox] = cardCheck('private');
  privateBox.checked = true;
  const [unreadOption, unreadBox] = cardCheck('readLater');
  if (pdf) options.append(...unreadOption.children);
  // Share to group not while private, as in the bookmark form (form/form.css); to an outliner it can
  const showGroup = () => group.parentNode.hidden = privateBox.checked || group.options.length < 2;
  privateBox.addEventListener('change', showGroup);
  fields.append(picker, drop, list, cardField('fieldDescription', description), cardField('fieldTags', tags),
    tagSuggestions(tags), share, options);
  save.disabled = true;

  const ready = () => files.filter(entry => !entry.problem);
  const showReady = () => save.disabled = busy || !ready().length;

  function fileRow(entry) {
    const li = element('li');
    let preview;
    if (pdf || entry.problem) {
      preview = element('span', 'pdf-icon', pdf ? 'PDF' : '?');
    } else {
      preview = Object.assign(element('img'), {src: URL.createObjectURL(entry.file), alt: ''});
      preview.addEventListener('load', () => URL.revokeObjectURL(preview.src), {once: true});
      preview.addEventListener('error', () => URL.revokeObjectURL(preview.src), {once: true});
    }
    entry.status = element('span', entry.problem ? 'file-problem' : 'file-size', entry.problem || sizeFormat(entry.file.size));
    entry.remove = element('button', 'remove', '×');
    entry.remove.type = 'button';
    entry.remove.setAttribute('aria-label', message('libraryRemoveFile'));
    entry.remove.addEventListener('click', () => {
      files.splice(files.indexOf(entry), 1);
      li.remove();
      showReady();
    });
    li.append(preview, element('span', 'name', entry.file.name), entry.status, entry.remove);
    return li;
  }

  function pick(picked) {
    for (const file of picked || []) {
      if (files.some(({file: other}) => other.name == file.name && other.size == file.size &&
        other.lastModified == file.lastModified)) continue;
      const problem = pdf
        ? file.type != 'application/pdf' && !/\.pdf$/i.test(file.name) ? message('libraryNotPdf')
          : file.size >= PDF_LIMIT ? message('libraryPdfTooBig') : ''
        : !IMAGE_TYPES.includes(file.type) ? message('libraryNotImage') : '';
      const entry = {file, problem};
      entry.li = fileRow(entry);
      files.push(entry);
      list.append(entry.li);
    }
    showReady();
    if (ready().length) description.focus();
  }

  drop.addEventListener('click', () => picker.click());
  picker.addEventListener('change', () => {
    pick(picker.files);
    picker.value = '';
  });
  card.addEventListener('dragover', e => {
    e.preventDefault();
    card.classList.add('over');
  });
  card.addEventListener('dragleave', e => !card.contains(e.relatedTarget) && card.classList.remove('over'));
  card.addEventListener('drop', e => {
    e.preventDefault();
    card.classList.remove('over');
    if (!busy) pick(e.dataTransfer.files);
  });

  card.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy || !ready().length) return;
    busy = true;
    showReady();
    error.hidden = true;
    const done = [];
    for (const entry of ready()) {
      entry.remove.hidden = true;
      const bar = Object.assign(element('progress'), {max: 1, value: 0});
      entry.status.replaceWith(bar);
      const item = await addFile(entry.file,
        {type, tags: splitTags(tags.value), unread: unreadBox.checked, description: description.value.trim(),
          private: privateBox.checked, outliner: outliner.value, group: privateBox.checked ? '' : group.value},
        fraction => bar.value = fraction);
      entry.status.className = item ? 'done' : 'file-problem';
      entry.status.textContent = item ? '✓' : message('libraryUploadFailed');
      bar.replaceWith(entry.status);
      if (item) {
        done.push(item);
        files.splice(files.indexOf(entry), 1);
        continue;
      }
      entry.remove.hidden = false;
      error.hidden = false;
      // the limit of your plan: the rest won't go either
      if (uploadLimit()) {
        const link = Object.assign(element('a', '', message('libraryPremium')), {
          href: 'https://www.diigo.com/premium', target: '_blank', rel: 'noopener',
        });
        error.replaceChildren(message('libraryUploadLimit') + ' ', link);
        break;
      }
      error.textContent = message('libraryUploadError', diigoAnswer);
    }
    busy = false;
    save.textContent = message(files.length ? 'libraryRetry' : 'libraryUpload');
    showReady();
    if (!done.length) return;
    // a moment to see each ✓
    setTimeout(() => {
      list.querySelectorAll('.done').forEach(status => status.closest('li').remove());
      if (!files.length) shut();
      added(done.length);
    }, 800);
  });
  drop.focus();
}

const ADD = {bookmark: addBookmark, image: () => addFiles('image'), pdf: () => addFiles('pdf'), note: addNote,
  // a new outliner, with its name asked for, opened at once in Outliners (library-outliners.js)
  outliner: () => outlinerPart.addOutliner()};

function openAddMenu(open) {
  $('addMenu').classList.toggle('open', open);
  $('add').setAttribute('aria-expanded', String(open));
  if (open) addTypes.querySelector('button').focus();
}

// splitAdd: the five buttons at the top of the side bar; in the bar (as the + and its menu without splitAdd) while
// there's no side bar, before the index is built. Moved, not drawn again: their clicks stay with them. Kept here, not
// found by its id: showTags takes it out of the page with the rest of the side bar, and puts it back with this.
const addTypes = $('addTypes');

function placeAddTypes() {
  const inSide = !!settings.splitAdd && !$('main').hidden;
  if (inSide) $('side').prepend(addTypes);
  else if (addTypes.parentNode != $('addMenu')) $('addMenu').append(addTypes);
  $('addMenu').hidden = inSide;
}

// one popup at a time, as on diigo.com
function addItem(kind) {
  openAddMenu(false);
  if ($('popup').open) return;
  ADD[kind]();
}
