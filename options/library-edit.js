// A part of the Swift Library (library.html); library.js has what they share, library-page.js puts them to work.

// ---- editing and adding a bookmark, as the bookmark form of the add-on does (form/form.js, background.js) ----

// tags separated by spaces or commas, "between quotes" when there's a space in one; as in form/form.js
function splitTags(text) {
  const tags = (text.match(/"[^"]*"?|[^\s,"]+/g) || []).map(tag => tag.replace(/"/g, '').trim());
  return [...new Set(tags.filter(Boolean))];
}

function joinTags(tags) {
  return tags.map(tag => {
    tag = tag.replace(/"/g, "'").trim();
    return (/[\s,]/.test(tag) ? `"${tag}"` : tag) + ' ';
  }).join('');
}

// why Diigo didn't save it, as the form says it
function saveError(result) {
  if (!result) return message('errorNoAnswer');
  if (!result.status) return result.message || message('errorNoConnection');
  if (result.code == -1) return message('errorNotSignedIn');
  const why = message('errorNotSaved', [String(result.status), String(result.code)]);
  return why + (result.message ? ': ' + result.message : '.');
}

// a text field of the popups (cardField)
const input = (type, value) => Object.assign(element('input'), {type, value: value || '', spellcheck: false});

// After an edit in the popup: the bookmark or note anew in its place in the list (li, unless the list was drawn again
// meanwhile), and the tags at the side.
function showEdited(li, item, changed) {
  $('popup').close();
  // on Start (library-home.js): its blocks again
  if (state.view == 'home') return show({keepScroll: true});
  shown = shown.map(other => other == item ? changed : other);
  if (li.isConnected) li.replaceWith(itemElement(changed));
  showTags();
}

// A text field as high as its text, from its rows up to half the window, then it scrolls (.grows): as you type or paste
// in it, and once it shows with the text it has. More than its rows: the popup wider too (.roomy, as wide as that of a
// note), else a long text is a narrow column; it stays so till it closes, so it doesn't jump back and forth.
function autoGrow(field) {
  field.classList.add('grows');
  const fit = () => {
    field.style.height = 'auto';
    const popup = field.closest('dialog');
    if (popup && !popup.classList.contains('roomy') && field.scrollHeight > field.clientHeight) {
      popup.classList.add('roomy');
      field.style.height = 'auto';
    }
    // with its border, as the height of a field is (box-sizing: border-box), else a scroll bar of a pixel or two
    field.style.height = field.scrollHeight + field.offsetHeight - field.clientHeight + 'px';
  };
  field.addEventListener('input', fit);
  requestAnimationFrame(fit);
}

// A bookmark edited in the popup, as a new note is added (popupCard): URL, title, description, tags, private and read
// later, saved as the bookmark form does. Ctrl+Enter saves from the description too; Esc, × or a click next to it close
// it, but not while saving. A new bookmark is added in the bookmark form itself (addBookmark).
// An image or a PDF in the same popup, as Diigo's edit window has them (docs/diigo-com.md: The edit form): without the
// URL, which is its file, and Read later only for a PDF; saved as that window saves them (/item/save/image or pdf:
// singleSave), as the toolbar API is about bookmarks.
function editBookmark(item, li) {
  let saving = false;
  const kind = item.type == 'image' || item.type == 'pdf' ? item.type : 'bookmark';
  const heading = {bookmark: 'libraryEditBookmark', image: 'libraryEditImage', pdf: 'libraryEditPdf'}[kind];
  const {card, fields, error, save} = popupCard(heading, 'save', () => saving);
  const url = input('url', item.url);
  url.required = true;
  const title = input('text', item.title);
  const description = Object.assign(element('textarea'), {rows: 3, value: item.description || ''});
  autoGrow(description);
  const tags = input('text', joinTags(item.tags));
  const [options, privateBox] = cardCheck('private');
  const [unreadOptions, unreadBox] = cardCheck('readLater');
  options.append(...unreadOptions.children);
  privateBox.checked = !!item.private;
  unreadBox.checked = !!item.unread;
  // Title from the page: what the page at the web address in the field says its title is (pageTitleOf)
  const titleField = cardField('fieldTitle', title);
  const fromPage = element('button', 'title-from-page', message('libraryTitleFromPage'));
  fromPage.type = 'button';
  fromPage.addEventListener('click', async () => {
    fromPage.disabled = true;
    const found = await pageTitleOf(url.value.trim());
    fromPage.disabled = false;
    error.textContent = found ? '' : message('libraryTitlesNone', '1');
    error.hidden = !!found;
    if (!found) return;
    title.value = found;
    title.dispatchEvent(new Event('input'));
    title.focus();
  });
  if (kind == 'bookmark') titleField.append(fromPage);
  // Read later: a bookmark and a PDF, as in Diigo's edit window
  if (kind == 'image') unreadBox.closest('label')?.remove();
  // Share to outliner, for any kind (library-outliners.js: shareSelect, addItems)
  const outliner = outlinerPart.shareSelect();
  const share = element('div', 'share');
  share.append(outliner);
  fields.append(...kind == 'bookmark' ? [cardField('fieldUrl', url)] : [], titleField,
    cardField('fieldDescription', description), cardField('fieldTags', tags), share, options);
  // once it is saved: to the outliner chosen too; when that fails, the popup stays with why
  const shared = async saved => {
    if (!outliner.value || await outlinerPart.addItems(outliner.value, [saved])) return true;
    fail(message('outlinersNotSaved', $('status').textContent || '?'));
    return false;
  };

  let urlId = '';
  const fail = text => {
    saving = false;
    save.disabled = false;
    save.textContent = message('save');
    error.textContent = text;
    error.hidden = false;
  };
  card.addEventListener('keydown', e => e.key == 'Enter' && e.ctrlKey && card.requestSubmit());
  card.addEventListener('submit', async e => {
    e.preventDefault();
    if (kind != 'bookmark') return saveFileItem();
    const bm = {
      url: url.value.trim(), title: title.value.trim() || url.value.trim(), description: description.value.trim(),
      tags: splitTags(tags.value), private: privateBox.checked, unread: unreadBox.checked,
    };
    // another URL: as Diigo's own edit window saves it, which the toolbar API can't
    if (bm.url != item.url && !/^https?:\/\/./i.test(bm.url)) return fail(message('libraryBadUrl'));
    saving = true;
    save.disabled = true;
    save.textContent = message('saving');
    error.hidden = true;
    if (bm.url != item.url) {
      const saved = await saveWithNewUrl(item, {...bm, tags: joinTags(bm.tags).trim()});
      if (!saved) return fail(message('libraryUrlNotSaved'));
      if (!await shared(saved)) return;
      return showEdited(li, item, saved);
    }
    if (!urlId) {
      const found = await browser.runtime.sendMessage({type: 'open', url: bm.url}).catch(() => null);
      urlId = found?.bookmark?.urlId || '';
    }
    const result = await browser.runtime.sendMessage({type: 'save', ...bm, urlId}).catch(() => null);
    if (!result?.ok) return fail(saveError(result));
    // in the index at once; the next update brings Diigo's own
    Object.assign(item, bm, {updated: Math.floor(Date.now() / 1000)});
    await saveIndex({put: [item]});
    if (!await shared(item)) return;
    showEdited(li, item, item);
  });

  // an image or a PDF: as Diigo's edit window saves it; the index then has what Diigo answered (its thumbnail too)
  async function saveFileItem() {
    const edited = {
      ...item, title: title.value.trim() || item.title, description: description.value.trim(),
      private: privateBox.checked, unread: kind == 'pdf' ? unreadBox.checked : item.unread,
    };
    saving = true;
    save.disabled = true;
    save.textContent = message('saving');
    error.hidden = true;
    const edit = singleSave(edited, splitTags(tags.value));
    const saved = await postSave(edit.url, new URLSearchParams(edit.params)).catch(e => {
      diigoAnswer = e?.message || String(e);
      return null;
    });
    if (!saved) return fail(message('libraryItemNotSaved', diigoAnswer || '?'));
    // its thumbnail kept when the answer has none
    const fresh = {...indexItem(saved)};
    if (!fresh.thumb && item.thumb) fresh.thumb = item.thumb;
    Object.assign(item, fresh.id == item.id ? fresh : {...edited, tags: splitTags(tags.value)},
      {updated: Math.floor(Date.now() / 1000)});
    await saveIndex({put: [item]});
    if (!await shared(item)) return;
    showEdited(li, item, item);
  }
  title.focus();
}

// a text with HTML in it: a note that is rich all the same, though Diigo doesn't say so (is_rich_note), as older ones
const looksLikeHtml = text =>
  /<(p|br|div|span|ul|ol|li|a|b|strong|i|em|u|h[1-6]|img|table|blockquote|pre|code)\b[^>]*>/i.test(text || '');

// The editor of a rich note (editNote, addNote): what it shows, editable, below a row of buttons for what is used most
// (bold, italic, underlined, lists, a link, no formatting), each for what is selected; as high as the window lets it,
// and higher by dragging its corner. execCommand, which every browser still has for an editable element: the HTML it
// makes is what Diigo's own note editor makes too.
const NOTE_TOOLS = [
  {label: 'B', key: 'noteBold', command: 'bold', className: 'bold'},
  {label: 'I', key: 'noteItalic', command: 'italic', className: 'italic'},
  {label: 'U', key: 'noteUnderline', command: 'underline', className: 'underline'},
  {label: '•', key: 'noteBulletList', command: 'insertUnorderedList'},
  {label: '1.', key: 'noteNumberedList', command: 'insertOrderedList'},
  {label: '🔗', key: 'noteLink', command: 'createLink'},
  {label: 'T̸', key: 'noteClearFormat', command: 'removeFormat'},
];

function noteEditor() {
  const editor = element('div', 'note-editor');
  const tools = element('div', 'note-tools');
  const content = element('div', 'note-text');
  content.contentEditable = 'true';
  for (const tool of NOTE_TOOLS) {
    const button = element('button', tool.className || '', tool.label);
    button.type = 'button';
    button.title = message(tool.key);
    button.setAttribute('aria-label', message(tool.key));
    // mousedown: the selection in the text stays
    button.addEventListener('mousedown', e => e.preventDefault());
    button.addEventListener('click', () => {
      content.focus();
      if (tool.command == 'createLink') {
        const url = prompt(message('noteLinkPrompt'), 'https://');
        if (!url || !/^(https?:|mailto:)/i.test(url.trim())) return;
        document.execCommand('createLink', false, url.trim());
      } else {
        document.execCommand(tool.command);
        if (tool.command == 'removeFormat') document.execCommand('unlink');
      }
    });
    tools.append(button);
  }
  editor.append(tools, content);
  return {editor, content};
}

// The HTML of a rich note for its editor in this page (editNote), without what could run or load something here:
// scripts, styles, frames and the like, on… attributes and javascript: links. Nothing of it is lost: those elements
// wait in a comment (dqa-kept:<n>) and those attributes in data-dqa-kept-<name>, and keptHtml puts them back in what
// is saved.
const KEPT_ELEMENTS = 'script, style, iframe, frame, object, embed, link, meta, base, form';

function cleanHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const kept = [];
  const keep = el => {
    kept.push(el.outerHTML);
    return doc.createComment(`dqa-kept:${kept.length - 1}`);
  };
  // what the parser put in the head (a style or meta at the start): at the start of the body, in its order
  [...doc.head.children].reverse().forEach(el => doc.body.prepend(keep(el)));
  doc.body.querySelectorAll(KEPT_ELEMENTS).forEach(el => el.isConnected && el.replaceWith(keep(el)));
  for (const el of doc.body.querySelectorAll('*')) {
    for (const {name, value} of [...el.attributes]) {
      // data: only as the src of an image in the note itself
      const bad = name.startsWith('on') || /^\s*javascript:/i.test(value) || /^\s*data:/i.test(value) && name != 'src';
      if (!bad) continue;
      el.setAttribute('data-dqa-kept-' + name, value);
      el.removeAttribute(name);
    }
  }
  return {html: doc.body.innerHTML, kept};
}

// what cleanHtml set aside, back in the edited HTML
function keptHtml(html, kept) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  for (const comment of comments) {
    const n = comment.data.match(/^dqa-kept:(\d+)$/)?.[1];
    if (n == null || kept[n] == null) continue;
    // parsed on its own, as the rest (inert: DOMParser runs nothing), and put back in the place of the comment
    comment.replaceWith(...new DOMParser().parseFromString(`<body>${kept[n]}</body>`, 'text/html').body.childNodes);
  }
  for (const el of doc.body.querySelectorAll('*')) {
    for (const {name, value} of [...el.attributes]) {
      if (!name.startsWith('data-dqa-kept-')) continue;
      el.setAttribute(name.slice('data-dqa-kept-'.length), value);
      el.removeAttribute(name);
    }
  }
  return doc.body.innerHTML;
}

// A note edited in the popup, as a new one is added (addNote): its title, its text and its tags, saved as Diigo's note
// editor saves it (library-index.js: saveNote). The text of a rich note in an editable box, as HTML; of a plain one in
// a text field. Ctrl+Enter saves; Esc, × or a click next to it close it, but not while saving.
function editNote(item, li) {
  let saving = false;
  const {card, fields, error, save} = popupCard('libraryEditNote', 'save', () => saving);
  const title = input('text', item.title);
  let content;
  let editor;
  let kept = [];  // what cleanHtml set aside
  // Code (its title ends in .py, .css, .html…: library-code.js): as text, in colours, also an .html note, whose HTML is
  // the code itself; a rich one as the code it shows (noteCode), saved again in a <pre> (codeNote)
  const language = codeLanguage(item.title);
  // HTML also when Diigo doesn't call it rich, as with older notes: edited as it shows all the same, and saved as the
  // kind it is (saveNote), so Diigo shows it as before
  const asHtml = !language && (item.rich || looksLikeHtml(item.content));
  if (language) {
    ({editor, content} = codeEditor(item.rich ? noteCode(item.content) : item.content, language));
  } else if (asHtml) {
    ({editor, content} = noteEditor());
    const clean = cleanHtml(item.content);
    content.replaceChildren(...new DOMParser().parseFromString(`<body>${clean.html}</body>`, 'text/html').body.childNodes);
    kept = clean.kept;
  } else {
    content = editor = Object.assign(element('textarea', 'note-plain'), {rows: 14, value: item.content});
  }
  $('popup').classList.add('wide');
  const text = element('div', 'field static');
  text.append(element('span', 'static-label', message('libraryNoteText')), editor);
  const tags = input('text', joinTags(item.tags));
  // Share to outliner, as for a bookmark (editBookmark)
  const outliner = outlinerPart.shareSelect();
  const share = element('div', 'share');
  share.append(outliner);
  fields.append(cardField('fieldTitle', title), text, cardField('fieldTags', tags), share);

  card.addEventListener('keydown', e => e.key == 'Enter' && e.ctrlKey && card.requestSubmit());
  card.addEventListener('submit', async e => {
    e.preventDefault();
    saving = true;
    save.disabled = true;
    save.textContent = message('saving');
    error.hidden = true;
    const code = language && item.rich ? codeNote(content.value) : content.value;
    const changed = await saveNote(item, {
      title: title.value.trim() || item.title,
      content: asHtml ? keptHtml(content.innerHTML, kept) : code,
      tags: splitTags(tags.value),
    });
    saving = false;
    save.disabled = false;
    save.textContent = message('save');
    if (!changed) {
      error.textContent = message('libraryNoteNotSaved', diigoAnswer);
      error.hidden = false;
      return;
    }
    if (outliner.value && !await outlinerPart.addItems(outliner.value, [changed])) {
      error.textContent = message('outlinersNotSaved', $('status').textContent || '?');
      error.hidden = false;
      return;
    }
    showEdited(li, item, changed);
  });
  content.focus();
}

// A note read in the popup, in the Swift Library itself instead of on diigo.com: its title, its text as it shows (rich:
// as HTML, without what could run or load something here, as cleanHtml leaves it for its editor; plain: as text; code,
// by the end of its title: in colours, library-code.js), when it was saved and its tags (a click shows the others with
// that tag). Edit opens editNote in its place, On Diigo the note there; neither for one in the trash. Opened by a click
// on its title (noteTitle), not with Ctrl, Shift or the middle button, which open it on Diigo as before.
function viewNote(item, li) {
  const gone = !!(item.deletedAt || item.pendingDelete);
  const {card, fields, save} = popupCard('libraryEditNote', 'libraryEdit');
  $('popup').classList.add('wide', 'viewing');
  card.querySelector('header h1').textContent = item.title || message('libraryEditNote');

  const language = codeLanguage(item.title);
  let body;
  if (language) {
    body = element('pre', 'code-view code-static');
    body.append(highlight(item.rich ? noteCode(item.content) : item.content, language));
  } else if (item.rich || looksLikeHtml(item.content)) {
    body = element('div', 'note-view');
    const doc = new DOMParser().parseFromString(cleanHtml(item.content).html, 'text/html');
    body.append(...doc.body.childNodes);
    for (const link of body.querySelectorAll('a[href]')) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
  } else {
    body = element('div', 'note-view plain', item.content);
  }
  fields.append(body);

  const meta = element('div', 'note-meta');
  if (item.created > 0 && item.created < 1e11) meta.append(element('span', 'date', dateFormat.format(item.created * 1000)));
  for (const name of item.tags) {
    const tag = element('button', 'tag', name);
    tag.type = 'button';
    tag.addEventListener('click', () => {
      $('popup').close();
      addTag(name);
    });
    meta.append(tag);
  }
  if (meta.children.length) fields.append(meta);

  const footer = card.querySelector('footer');
  if (gone) {
    save.remove();
  } else {
    const onDiigo = element('a', 'on-diigo', message('libraryOpenDiigo'));
    onDiigo.href = diigoItemUrl(item);
    onDiigo.target = '_blank';
    onDiigo.rel = 'noopener';
    footer.prepend(onDiigo);
    card.addEventListener('submit', e => {
      e.preventDefault();
      $('popup').classList.remove('viewing');
      editNote(item, li);
    });
  }
  // the text itself scrolls, not the page; the keyboard there at once
  body.tabIndex = 0;
  body.focus();
}

// An image shown here, so it needn't be looked at on diigo.com: its file as Diigo keeps it (itemFileUrl), fetched with
// your sign-in and shown from this page (a blob), or the file the trash kept of it; as large as the popup lets it, a
// click on it the file itself in a new tab. Below it when it was saved and its tags, as for a note; On Diigo in the
// footer, for what is only there (its highlights, sharing).
function viewImage(item) {
  const gone = !!(item.deletedAt || item.pendingDelete);
  const {card, fields, save} = popupCard('libraryAddImage', 'libraryEdit');
  // larger than the popup of a note: nearly as wide and high as the window (.popup.image-popup)
  $('popup').classList.add('wide', 'viewing', 'image-popup');
  card.querySelector('header h1').textContent = item.title || message('libraryAddImage');
  save.remove();

  const body = element('div', 'image-view');
  const status = element('p', 'image-status', message('libraryImageLoading'));
  body.append(status);
  fields.append(body);
  const meta = element('div', 'note-meta');
  if (item.created > 0 && item.created < 1e11) meta.append(element('span', 'date', dateFormat.format(item.created * 1000)));
  for (const name of item.tags) {
    const tag = element('button', 'tag', name);
    tag.type = 'button';
    tag.addEventListener('click', () => {
      $('popup').close();
      addTag(name);
    });
    meta.append(tag);
  }
  if (meta.children.length) fields.append(meta);
  if (!gone) {
    const onDiigo = element('a', 'on-diigo', message('libraryOpenDiigo'));
    onDiigo.href = diigoItemUrl(item);
    onDiigo.target = '_blank';
    onDiigo.rel = 'noopener';
    card.querySelector('footer').prepend(onDiigo);
  }

  const loading = new AbortController();
  let shown = '';
  $('popup').addEventListener('close', () => {
    loading.abort();
    if (shown) URL.revokeObjectURL(shown);
  }, {once: true});
  (async () => {
    const file = item.file instanceof Blob ? item.file : await (async () => {
      const url = await itemFileUrl(item.id, loading.signal);
      if (!url) return null;
      const answer = await fetch(url, {credentials: 'include', signal: timeLimit(loading.signal, FILE_TIME)});
      return answer.ok ? answer.blob() : null;
    })();
    if (!file?.size) throw new Error(message('libraryImageNone'));
    shown = URL.createObjectURL(file);
    const link = element('a', 'image-file');
    link.href = shown;
    link.target = '_blank';
    link.title = message('libraryImageOpen');
    const image = element('img');
    image.alt = item.title || '';
    image.src = shown;
    link.append(image);
    body.replaceChildren(link);
  })().catch(e => {
    if (loading.signal.aborted) return;
    status.textContent = e?.message || String(e);
    status.classList.add('error');
  });
}


// ---- bookmarks without a real title: the title of their page fetched ----

// No title, its web address as title, or one an app gives a page without one (Untitled, New Tab…): Without a title
// (Clean up on Start, the view notitle). Fetch titles asks each page for its own title (background.js: pageInfo, a
// few at a time) and saves it as the edit window does (saveTitle); a page that gives none, or the same, stays as it was.
const NO_TITLE = /^\s*[([]?\s*(untitled( (document|page|note|bookmark))?|no title|new tab|nieuw tabblad|neuer tab|nouvel onglet|nueva pestaña|document|home|index|default|page)\s*[)\]]?\s*$/i;
const TITLES_AT_ONCE = 4;

function untitled(item) {
  if (item.type && item.type != 'bookmark' || !/^https?:/i.test(item.url)) return false;
  const title = (item.title || '').trim();
  const bare = url => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/+$/, '');
  return !title || NO_TITLE.test(title) || bare(title) == bare(item.url);
}

// one bookmark with another title, in Diigo (as the bookmark form saves it) and in the index; true when Diigo took it
async function saveTitle(item, title) {
  const found = await browser.runtime.sendMessage({type: 'open', url: item.url}).catch(() => null);
  const bm = {
    url: item.url, title, description: item.description, tags: item.tags, private: item.private, unread: item.unread,
    urlId: found?.bookmark?.urlId || '',
  };
  const result = await browser.runtime.sendMessage({type: 'save', ...bm}).catch(() => null);
  if (!result?.ok) return false;
  Object.assign(item, {title, updated: Math.floor(Date.now() / 1000)});
  await saveIndex({put: [item]});
  return true;
}

// the title of the page of a web address, or '' (also when it's no title either)
async function pageTitleOf(url) {
  const info = await browser.runtime.sendMessage({type: 'pageInfo', url}).catch(() => null);
  const title = (info?.title || '').trim();
  return title && !untitled({url, title}) ? title : '';
}

async function fetchTitles(items) {
  const todo = items.filter(untitled);
  if (controller || !todo.length) return;
  start();
  let next = 0, done = 0, named = 0;
  const worker = async () => {
    while (next < todo.length && !stopped) {
      const item = todo[next++];
      const title = await pageTitleOf(item.url);
      if (title && title != item.title && await saveTitle(item, title)) named++;
      showStatus(message('bulkProgress', [String(++done), String(todo.length)]));
    }
  };
  try {
    await Promise.all([...Array(TITLES_AT_ONCE)].map(worker));
  } catch (e) {
    reportProblem(e, 'titles');
  } finally {
    stop();
    const text = message('libraryTitlesFetched', String(named));
    const none = done - named;
    showStatus(none ? text + ' ' + message('libraryTitlesNone', String(none)) : text, false);
    show({keepScroll: true});
  }
}
