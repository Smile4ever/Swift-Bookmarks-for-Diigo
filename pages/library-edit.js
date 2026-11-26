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
// without the browser's own list of what was typed before (form history), which would cover the suggestions of the
// add-on below the tags (autocomplete), as the bookmark form has it (form/form.html)
const input = (type, value) => Object.assign(element('input'), {type, value: value || '', spellcheck: false, autocomplete: 'off'});

// ---- tags suggested in the popups, as the bookmark form suggests them (form/form.js: showSuggestions, showRelated) ----

// Below the field of the tags, from the index: Suggested, your tags that are whole words in the title (or the web
// address of a bookmark) and those of the newest other bookmark on the same site; Often with these, the tags you use
// most together with those in the field (as background.js: relatedTagsOf, RELATED_LEAST times at least). Not those in
// the field, nor hidden ones. A click adds one (or takes it out again); Suggested itself adds all of them. As you type,
// your tags to choose from too (autocomplete). Drawn again as the tags or the title change.
// item: what is edited ({} for a new one); title: its field, none in Add Image and Add PDF.
// And the tag icon at the right of the field, as in the form (#cloud-button): your 100 most used tags as a cloud, the
// more used the larger, those in the field marked; a click adds one or takes it out.
const POPUP_CLOUD_TAGS = 100;
const SUGGEST_RELATED = 6;
const SUGGEST_LEAST = 2;

// the tags of the newest other bookmark on the site of item
function siteTagsOf(item) {
  const host = item.url && isWebPage(item) ? hostOf(item.url) : '';
  if (!host) return [];
  let newest = null;
  for (const other of liveItems()) {
    if (other.id == item.id || !other.tags.length || !isWebPage(other) || hostOf(other.url) != host) continue;
    if (!newest || other.created > newest.created) newest = other;
  }
  return newest?.tags || [];
}

// the tags most often on the same items as those chosen (lower case), not those of leave out
function tagsTogether(chosen, leaveOut) {
  if (!chosen.length) return [];
  const counts = new Map();
  for (const other of liveItems()) {
    const keys = other.tags.map(lower);
    if (!keys.some(tag => chosen.includes(tag)) || other.tags.some(hiddenTag)) continue;
    for (const tag of other.tags) {
      const key = lower(tag);
      if (leaveOut.has(key)) continue;
      const known = counts.get(key);
      counts.set(key, {name: tag, count: (known?.count || 0) + 1});
    }
  }
  return [...counts.values()].filter(({count}) => count >= SUGGEST_LEAST).sort((a, b) => b.count - a.count)
    .slice(0, SUGGEST_RELATED).map(({name}) => name);
}

function tagSuggestions(tags, item = {}, title = null) {
  const box = element('div', 'tag-suggest');
  const suggestedRow = element('p', 'suggested');
  const relatedRow = element('p', 'related');
  const cloud = element('div', 'tag-cloud-box');
  cloud.hidden = true;
  box.append(cloud, suggestedRow, relatedRow);
  const counted = visibleTags(tagCounts(liveItems()));
  const names = counted.map(tag => tag.name);
  const siteTags = siteTagsOf(item);
  const setTags = list => {
    tags.value = joinTags(list);
    tags.dispatchEvent(new Event('input', {bubbles: true}));
    tags.focus();
    tags.setSelectionRange(tags.value.length, tags.value.length);
  };
  const toggle = name => {
    const list = splitTags(tags.value);
    const have = list.some(tag => lower(tag) == lower(name));
    setTags(have ? list.filter(tag => lower(tag) != lower(name)) : [...list, name]);
  };
  const chip = name => {
    const button = element('button', 'tag', name);
    button.type = 'button';
    button.addEventListener('click', () => toggle(name));
    return button;
  };
  // the cloud, drawn when it is opened; the tag icon in the field itself (cardField, made before this)
  const cloudButton = element('button', 'cloud-button');
  cloudButton.type = 'button';
  cloudButton.title = message('yourTags');
  cloudButton.setAttribute('aria-label', message('yourTags'));
  cloudButton.addEventListener('click', () => {
    cloud.hidden = !cloud.hidden;
    if (!cloud.hidden) draw();
  });
  const placeButton = () => tags.parentElement ? tags.parentElement.append(cloudButton) : requestAnimationFrame(placeButton);
  placeButton();
  const drawCloud = have => {
    const top = [...counted].sort((a, b) => b.count - a.count).slice(0, POPUP_CLOUD_TAGS);
    const counts = [...new Set(top.map(tag => tag.count))];
    const head = element('div', 'cloud-head');
    head.append(element('span', '', message('tagCloudHead')));
    const list = element('div', 'cloud-tags');
    for (const {name, count} of top.sort((a, b) => a.name.localeCompare(b.name))) {
      const rank = counts.indexOf(count) / counts.length;  // 0 for the most used
      const button = chip(name);
      button.classList.toggle('chosen', have.has(lower(name)));
      button.style.fontSize = (17 - 5 * rank).toFixed(1) + 'px';
      if (rank < 0.2) button.style.fontWeight = '600';
      list.append(button);
    }
    if (!top.length) list.textContent = message('noTags');
    cloud.replaceChildren(head, list);
  };
  const draw = () => {
    const have = new Set(splitTags(tags.value).map(lower));
    if (!cloud.hidden) drawCloud(have);
    const url = isWebPage(item) ? item.url : '';
    const mentioned = title || url ? tagsMentioned(title?.value || '', url, names) : [];
    const suggested = [...new Set([...siteTags, ...mentioned])]
      .filter(tag => !hiddenTag(tag) && !have.has(lower(tag)));
    const all = element('button', 'label', message('recommended'));
    all.type = 'button';
    all.title = message('addAll');
    all.addEventListener('click', () => setTags([...splitTags(tags.value), ...suggested]));
    suggestedRow.replaceChildren(all, ...suggested.map(chip));
    suggestedRow.hidden = !suggested.length;
    const related = tagsTogether([...have], new Set([...have, ...suggested.map(lower)]));
    relatedRow.replaceChildren(element('span', 'label', message('relatedTags')), ...related.map(chip));
    relatedRow.hidden = !related.length;
  };
  tags.addEventListener('input', draw);
  title?.addEventListener('input', draw);
  draw();
  autocomplete(tags, 'tag');
  return box;
}

// After an edit in the popup: the bookmark or note anew in its place, the rest of the page as it is (library-list.js:
// redrawItems), and the tags at the side. before: the item as it was before the edit. On Start (library-home.js) its
// blocks again only when it belongs in others now (sameBlocks): read, private, tags.
function showEdited(li, item, changed, before) {
  $('popup').close();
  if (state.view == 'home' && !sameBlocks(before, changed)) return show({keepScroll: true});
  shown = shown.map(other => other == item ? changed : other);
  if (li.isConnected && !li.dataset.id) li.replaceWith(itemElement(changed));
  redrawItems([changed], item.id);
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
  const before = {...item, tags: [...item.tags]};
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
  // Also save a screenshot, as in the bookmark form (off each time, as Diigo keeps only so many images): the page opened in a tab
  // for a moment for it (background.js: screenshotOf); with a warning for a bookmark with a hidden tag
  const [shotOptions, shotBox] = cardCheck('formScreenshot');
  const shotWarning = element('p', 'card-warning', message('screenshotHiddenWarn'));
  shotWarning.setAttribute('role', 'alert');
  const showShotWarning = () =>
    shotWarning.hidden = !shotBox.checked || !screenshotOfHidden(settings, splitTags(tags.value));
  if (kind == 'bookmark') {
    options.append(...shotOptions.children);
    shotBox.addEventListener('change', showShotWarning);
    tags.addEventListener('input', showShotWarning);
    showShotWarning();
  } else {
    shotWarning.hidden = true;
  }
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
    cardField('fieldDescription', description), cardField('fieldTags', tags), tagSuggestions(tags, item, title), share,
    options, shotWarning);
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
    // a screenshot of its page along: the page in a tab for a moment (background.js: screenshotOf), a link to it in
    // the description; without one when that fails, saved all the same
    if (shotBox.checked && /^https?:\/\//i.test(bm.url)) {
      save.textContent = message('screenshotTaking');
      const shot = await browser.runtime.sendMessage({type: 'screenshot', url: bm.url, title: bm.title, tags: bm.tags})
        .catch(() => '');
      if (shot) bm.description = [bm.description, message('screenshotLine', shot)].filter(Boolean).join('\n\n');
      else showStatus(message('screenshotFailed'), true);
      save.textContent = message('saving');
    }
    if (bm.url != item.url) {
      const saved = await saveWithNewUrl(item, {...bm, tags: joinTags(bm.tags).trim()});
      if (!saved) return fail(message('libraryUrlNotSaved'));
      if (!await shared(saved)) return;
      return showEdited(li, item, saved, before);
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
    showEdited(li, item, item, before);
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
    showEdited(li, item, item, before);
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
  const before = {...item, tags: [...item.tags]};
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
  fields.append(cardField('fieldTitle', title), text, cardField('fieldTags', tags), tagSuggestions(tags, item, title), share);

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
    showEdited(li, item, changed, before);
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

// An image shown here, so it needn't be looked at on diigo.com: its thumbnail (thumbnail_url) at a large size, fetched
// with your sign-in and shown from this page (a blob), or the file the trash kept of it (index-item.js: largeImage),
// as a privacy precaution. It is big enough to look at. No On Diigo link in the footer. A click on the shown image
// opens it (the blob) in a new tab.
function viewImage(item) {
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

  const loading = new AbortController();
  let shown = '';
  $('popup').addEventListener('close', () => {
    loading.abort();
    if (shown) URL.revokeObjectURL(shown);
  }, {once: true});
  (async () => {
    const file = item.file instanceof Blob ? item.file : await (async () => {
      // the thumbnail at a large size (a privacy precaution)
      if (!item.thumb) return null;
      const url = largeImage(item);
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


// Open a PDF the way Diigo's own reader does. Diigo serves a PDF's file only through its reader page, and only to a
// first-party, signed-in request on diigo.com — a cross-origin fetch or iframe from the add-on gets Cloudflare's wall
// or the signed-out shell, not the file. So a live PDF opens in Diigo's reader in a new tab (a real navigation, where
// your sign-in and Cloudflare work); the new tab keeps the Swift Library. There #swift-pdf has diigo-site/pdf-view.js click Download Original PDF and show the file with the
// browser's own PDF viewer instead of saving it. A PDF the trash kept (its file as a blob, gone from Diigo) is shown
// here inline from that blob.
function viewPdf(item) {
  if (!(item.file instanceof Blob)) {
    const url = item.url || diigoItemUrl(item);
    window.open(/^https?:\/\/(www\.)?diigo\.com\/item\/pdf\//i.test(url) ? url.replace(/#.*$/, '') + '#swift-pdf' : url,
      '_blank', 'noopener');
    return;
  }
  const {card, fields, save} = popupCard('libraryAddPdf', 'libraryEdit');
  // nearly as wide and high as the window (.popup.pdf-popup), like the image view
  $('popup').classList.add('wide', 'viewing', 'pdf-popup');
  card.querySelector('header h1').textContent = item.title || message('libraryAddPdf');
  save.remove();

  const body = element('div', 'pdf-view');
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

  const shown = URL.createObjectURL(item.file);
  $('popup').addEventListener('close', () => URL.revokeObjectURL(shown), {once: true});
  const frame = element('iframe', 'pdf-frame');
  frame.src = shown;
  frame.title = item.title || '';
  frame.style.width = '100%';
  frame.style.height = '75vh';
  frame.style.border = 'none';
  const open = element('a', 'pdf-open', message('libraryPdfOpen'));
  open.href = shown;
  open.target = '_blank';
  open.rel = 'noopener';
  body.replaceChildren(frame, open);
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
