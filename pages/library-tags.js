// A part of the Swift Library (library.html); library.js has what they share, library-page.js puts them to work.

// ---- similar tags: those that are nearly the same, made one ----

// Similar tags (Clean up on Start, library-home.js) opens #similarDialog: each group of tags that are nearly the same
// (library-index.js: similarTagGroups), with how many bookmarks each has. One of them is kept, the most used unless
// another is chosen; Merge gives the bookmarks with the others that one in their place, in Diigo and in the index
// (editItems: mergeTags). Not the same leaves the group out from then on (IGNORED_KEY, in this browser). No hidden
// tags: those stay out of sight here as everywhere.
const IGNORED_KEY = 'ignoredTagGroups';
let ignoredGroups = new Set();  // groupKey of each group left out

const groupKey = group => group.map(tag => lower(tag.name)).sort().join('\n');

async function loadIgnoredGroups() {
  // with the account of the browser too (settings.js: SYNCED_LISTS)
  const saved = (await loadKept([IGNORED_KEY]).catch(() => ({})))[IGNORED_KEY];
  ignoredGroups = new Set(Array.isArray(saved) ? saved : []);
}

// the groups to show, as the index is now
const similarTags = () => similarTagGroups(visibleTags(tagCounts(liveItems())))
  .filter(group => !ignoredGroups.has(groupKey(group)));

function similarGroup(group, i) {
  const li = element('li', 'similar-group');
  const choices = element('div', 'similar-tags');
  for (const [k, tag] of group.entries()) {
    const label = element('label');
    const radio = element('input');
    radio.type = 'radio';
    radio.name = 'similar-' + i;
    radio.value = tag.name;
    radio.checked = k == 0;
    label.append(radio, element('span', 'tag', tag.name), element('span', 'count', String(tag.count)));
    choices.append(label);
  }
  const actions = element('div', 'similar-actions');
  const merge = element('button', 'primary', message('similarMerge'));
  merge.type = 'button';
  merge.addEventListener('click', () => {
    const into = choices.querySelector('input:checked')?.value || group[0].name;
    mergeTags(group.map(tag => tag.name).filter(name => name != into), into);
  });
  const ignore = element('button', '', message('similarIgnore'));
  ignore.type = 'button';
  ignore.addEventListener('click', async () => {
    ignoredGroups.add(groupKey(group));
    await saveSettings({[IGNORED_KEY]: [...ignoredGroups]}).catch(() => {});
    fillSimilar();
    show({keepScroll: true});
  });
  actions.append(merge, ignore);
  li.append(choices, actions);
  return li;
}

function fillSimilar() {
  const groups = similarTags();
  $('similarNone').hidden = groups.length > 0;
  $('similarGroups').replaceChildren(...groups.map(similarGroup));
  for (const button of $('similarGroups').querySelectorAll('button')) button.disabled = !!controller;
}

async function showSimilarTags() {
  await loadIgnoredGroups();
  fillSimilar();
  $('similarDialog').showModal();
}

// the bookmarks with one of tags get into in their place; the progress in the status line, as Bulk edit
async function mergeTags(tags, into) {
  if (controller || !tags.length) return;
  const ids = liveItems().filter(item => tags.some(tag => hasTag(item, tag))).map(item => item.id);
  const signal = start();
  fillSimilar();
  let result = {changed: 0, failed: 0};
  try {
    result = await editItems(ids, {type: 'mergeTags', tags, into}, signal,
      (done, total) => showStatus(message('bulkProgress', [String(done), String(total)])));
  } catch (e) {
    reportProblem(e, 'similar tags');
  } finally {
    stop();
    const text = message('similarMerged', [String(result.changed), into]);
    const why = message('bulkFailed', String(result.failed)) + (diigoAnswer ? ' ' + diigoAnswer : '');
    showStatus(result.failed ? text + ' ' + why : text, !!result.failed);
    fillSimilar();
    show({keepScroll: true});
  }
}


// ---- a tag renamed, on all your items ----

// As Diigo's own Rename of a tag (update_tags in its code: old_tag and new, in the address and as fields, encoded as
// the app encodes them; the answer is 1): one request for the whole library, and the index the same at once. When
// Diigo doesn't take it, each item with the tag gets the new one in its place, as Merge of Similar tags does.
const RENAME_TAG_URL = 'https://www.diigo.com/tag_mana2/update_tags';

async function renameTagOnDiigo(old, name) {
  const [from, to] = [encodeURIComponent(old), encodeURIComponent(name)];
  try {
    const response = await fetch(`${RENAME_TAG_URL}?old_tag=${from}&new=${to}`, {
      method: 'POST',
      credentials: 'include',
      headers: {'X-Requested-With': 'XMLHttpRequest'},
      body: new URLSearchParams({old_tag: from, new: to}),
      signal: timeLimit(),
    });
    const answer = (await response.text()).trim();
    if (response.ok && answer == '1') return true;
    diigoAnswer = `${response.status} ${/<html/i.test(answer) ? '(a web page)' : answer.slice(0, 200)}`;
  } catch (e) {
    diigoAnswer = e?.message || String(e);
  }
  return false;
}

async function renameTag(old) {
  if (controller) return;
  const name = prompt(message('tagRenamePrompt', old), old)?.replace(/"/g, "'").trim();
  if (!name || name == old) return;
  const items = liveItems().filter(item => hasTag(item, old));
  const signal = start();
  showStatus(message('tagRenaming', old));
  let failed = 0;
  try {
    if (await renameTagOnDiigo(old, name)) {
      for (const item of items) {
        const left = item.tags.filter(tag => !hasTag({tags: [tag]}, old));
        item.tags = hasTag({tags: left}, name) ? left : [...left, name];
      }
      await saveIndex({put: items});
    } else {
      ({failed} = await editItems(items.map(item => item.id), {type: 'mergeTags', tags: [old], into: name}, signal,
        (done, total) => showStatus(message('bulkProgress', [String(done), String(total)]))));
    }
  } catch (e) {
    reportProblem(e, 'rename tag');
    failed = items.length;
  } finally {
    stop();
    // a filter on the old name: the new one
    state.tags = state.tags.map(tag => lower(tag) == lower(old) ? name : tag);
    const text = message('tagRenamed', [old, name, String(items.length - failed)]);
    const why = message('bulkFailed', String(failed)) + (diigoAnswer ? ' ' + diigoAnswer : '');
    showStatus(failed ? text + ' ' + why : text, !!failed);
    show({keepScroll: true, push: true});
  }
}
