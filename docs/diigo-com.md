# How www.diigo.com works

Notes for `diigo-site/`, from looking at the site in Firefox's developer tools and reading its code (October 2026).
Diigo can change any of this.

All of this is about the new Diigo. Classic Diigo, behind "Back to classic" at the top of the library, is an older
library with other pages and code; the improvements of `diigo-site/` to the library don't work there.

## Three APIs

Diigo has three ways in, each made for something else:

| API | where | signed in with | made for |
|-----|-------|----------------|----------|
| toolbar API | `toolbar3.diigo.com/chappai/...`, also `/toolbar_server_v13` on diigo.com | the session cookie of diigo.com | Diigo's own browser extension |
| the site's own requests | `/interact_api/...`, `/item/save...`, `/ditem_mana2/...`, `/annotation_mana/...`, `/outliner/...` on diigo.com | the session cookie of diigo.com | the library page on diigo.com |
| public API | `/api/v2/bookmarks` | an API key with your name and password | other apps; not tried here |

* **Toolbar API**: one URL, the `cmd` parameter says what to do (`bm_loadBookmark`, `bm_saveBookmark`, `bm_deleteBookmark`,
  `user_loadMyStuff`...). It is about one page: is it saved, save it, delete it. This is what the add-on uses
  (`background/background.js`), on `/chappai/pv=13/ct=tb/`. Tried signed out: without `pv=13` and `ct=tb` the answer
  is a web page or an error instead of JSON; `cv`, the version Diigo's official add-on also sent
  (`cv=6.0.0.5resigned1`), can be anything or left out.
* **The site's own requests**: a URL per action, JSON answers with `code: 1`. They do what the toolbar API doesn't: the
  library page by page, bulk edits, outliners, annotations. Not documented and only meant for Diigo's own pages, so they
  can change without notice. The ones known are listed under [Requests the library makes](#requests-the-library-makes).
* **Public API**: documented by Diigo, but as far as known only listing and adding bookmarks. Not tried for the add-on;
  it would need an API key and your password in the add-on, where the other two use the sign-in you already have.

For the add-on the toolbar API stays the base. The site's own requests are the way to go for things the toolbar API
can't do, such as checking the links of the whole library at once instead of the page you're looking at, or changing
tags of many bookmarks from the add-on.

## The site's code

The library (`/user/<name>`) is a React 15 app (`createClass`, `<!-- react-text -->` comments in the page) with jQuery and
Semantic UI. Its code is public, also without signing in:

* `https://www.diigo.com/asset/dist/main.<hash>.js`: the app, unminified enough to read (the hash changes with each release;
  the current name is in the `<script>` tags of any diigo.com page, for instance `/profile/<name>`)
* `https://www.diigo.com/asset/dist/vendor.<hash>.js`: React and other libraries

Signed out, `/user/<name>` redirects to Hot Bookmarks, which loads other scripts (`/javascripts/v6/dist/main.min.js`)
without the library in it.

Search the app for a class name from the page (`outlinerGroupSelect`, `EditBookmark`) to find the component that draws it.

## Item types

`DIIGO_TYPE` in the app:

| type_name  | what                                  |
|------------|---------------------------------------|
| `bookmark` | a bookmark                            |
| `image`    | an image                              |
| `note`     | a note: always private                |
| `pdf`      | a PDF                                 |
| `kindle`   | Kindle highlights                     |
| `topic`    | group topic                           |

`mode == 2` is private; `readed == 0` is unread, `1` read.

### Notes, images and PDFs in the Swift Library

The Swift Library is made for bookmarks, but lists every item type:

* **Opening**: the title of a note opens it in the Swift Library to read, with Edit (`options/library-edit.js`:
  `viewNote`). Ctrl+click or the middle button, and the title of an image, a PDF or a Kindle item, lead to the item on
  Diigo (`/user/<name>/b/<link_id>`), as Diigo's own library opens every item (`options/library-list.js`: `titleUrl`).
* **Edit**: notes only (title, text, tags), with `/item/save/note`. Images, PDFs and Kindle items not: the toolbar API
  the add-on saves bookmarks with is about bookmarks.
* **Trash**: a deleted note, image or PDF goes to the trash like a bookmark. Put back saves a note again as a new note
  with its text (the index keeps it since version 3), and an image or a PDF from its file, which the trash keeps when it
  fits in the browser's storage (`options/index-item.js`: `roomFor`).
* **Bulk edit** changes their tags, privacy and read state. When `batch_edit_tags` fails, an image or a PDF is saved on
  its own (`/item/save/image`, `/item/save/pdf`); a note not, as that would save its text as the index has it.

## The edit form (`.EditBookmark`)

What it shows depends on the type of the item:

| field                                         | shown for                        |
|-----------------------------------------------|----------------------------------|
| Title, Tags, Share to outliner/group, Save    | all                              |
| URL                                           | `bookmark`                       |
| Description, Private (`#privacy-<link_id>`)   | all but `note`                   |
| Unread (`#star-<link_id>`)                    | `bookmark`, `pdf`                |

So a form without the Private box is a note, which Diigo always saves as private (`private: true`).
Share to outliner and Share to group are `.outlinerGroupSelect`.

## Requests the library makes

On diigo.com itself, with the session cookie. Answers are JSON with `code: 1` when it worked.

Seen in the network tab:

| request                                                   | what                                       |
|-----------------------------------------------------------|--------------------------------------------|
| `GET /interact_api/load_user_items?page_num=3&sort=updated&count=96` | a page of the library (`count`: 24, 48 or 96; `sort`: `updated` or `created`) |
| `GET /interact_api/load_user_tags?type=all`               | all your tags                              |
| `GET /outliner/list`                                      | your outliners, in `data.outliners`        |

`load_user_items` answers `{items, total}`: `total` is the number of items in the whole library; each item has
`link_id`, `url`, `title`, `description`, `type_name`, `t_name` (the tags: one string, separated by commas, sometimes
with one before the first; not `tags`, as the add-on first thought), `private` (0 or 1), `readed` (0: unread),
`annotations`, `thumbnail_url` (an image: its thumbnail, sized with `image_size=` in it, as Diigo's list asks 160), and `created_at` and `updated_at` (seconds since 1970); a note also has `note_content` (its text, HTML when
`is_rich_note` is 1). With `sort=updated` the last
changed come first, which is how `options/library-index.js` updates its index with only what changed (it builds the index
with `sort=created`, oldest first, so new bookmarks don't shift the pages while it runs). Also used for Random bookmark
(`background/background.js`).

Used by the add-on, from the app's code:

| request                                    | what                                        |
|--------------------------------------------|---------------------------------------------|
| `POST /item/save/bookmark`, `link_id`, `url`, `new_url`, `title`, `description`, `tags`, `private`, `unread` | save a bookmark as Diigo's edit window does (`EditItem`), also with another URL (`new_url`, only when it changed), which the toolbar API can't; `tags` as typed in Diigo, separated by spaces. The answer is `{items: [the bookmark]}`, which can have another `link_id`. Used by `options/library-index.js` for another URL |
| `POST /item/save/note`, `title`, `content`, `note_type`, `mode`, `tags`, `link_id` | save a note, as the app does (`newNote`, also from its note editor): with its `link_id`, or empty for a new one; `content` its text, `note_type` `rich` (HTML) or empty, `mode` 2 (notes are private), `tags` with commas and quotes (`"one","two"`). The answer is `{items: [the note]}`. Used by `options/library-index.js` (`postNote`) to add and edit a note in the Swift Library and to put one back from the trash |
| `GET /interact_api/batch_share_links`, `links` | the links of an item, as its Share window asks them: `{<link_id>: {item_url, file_url}}`; `file_url` is the file of an image or a PDF. Used for the trash (`options/index-item.js`: `itemFile`), before it is deleted |
| `POST /item/save/image` | multipart, as the app uploads an image (`newImage`): `qqfile` (the file), `qqfilename` (its name with `_1` after it), `private` (always `true`: the app makes an image public after; `false` made Diigo answer 500), `tags`, `lists`, `groups`; answers `{items: [the image]}` (`code` -2: not taken). Form-encoded with `link_id`, `title`, `description`, `tags`, `private` it saves an edited image, as its edit window does. Used to add images in the Swift Library (`addFile`), to put one back from the trash (`restoreFile`) and by Bulk edit |
| `POST /item/save/pdf`, `link_id`, `title`, `description`, `tags`, `private`, `unread` | save an edited PDF, as the edit window does; used by Bulk edit and to put a PDF back |
| `POST /item/save` | multipart, as the app uploads a PDF (`newPDF`): `qqfile`, `qqfilename`, `private`, `tags`, `dtype` `pdf`, `description`, `unread`, `lists`, `groups`; answers `{items: [the PDF]}`, or `code` -2 at the upload limit. Diigo's Add PDF window refuses a file of 64 MB or more before it uploads. Used to add PDFs in the Swift Library (`addFile`) and to put one back from the trash (`restoreFile`) |
| `POST /ditem_mana2/delete_b`, `link_id=1,2,3` | delete items: their `link_id`s, separated by commas, as the app does for several at once (`deleteItems`); used by Bulk edit in `options/library-bulk.js`, 50 at a time. Also how diigo.com itself deletes, wherever: `background/background.js` reads its `link_id` (webRequest, `DIIGO_DELETES`) and takes those items out of the index once Diigo answered |
| `POST /ditem_mana2/mark_readed`, `link_id=1,2,3`, `readed` | mark items read (`readed=1`) or unread (`0`); used by Bulk edit (`options/library-index.js`: `editItems`) |
| `POST /ditem_mana2/convert_mode`, `link_id=1,2,3`, `mode` | make items public (`mode=0`) or private (`2`); answers `{link_ids}`; used by Bulk edit |
| `POST /tag_mana2/update_tags?old_tag=<tag>&new=<tag>`, also as fields | rename a tag on all your items, as the app does (`Et` in its code): both names encoded with `encodeURIComponent`, in the address and (encoded once more) as the fields `old_tag` and `new`; the answer is `1`. Used by Rename tag in the Swift Library (`options/library-tags.js`: `renameTag`), with Merge as for Similar tags when Diigo doesn't take it |
| `POST /ditem_mana2/batch_edit_tags`, `editTags`, `editTagOption`, `infos` | tags of several items: `editTags` as typed in Diigo (separated by spaces), `editTagOption` 1 adds them, 0 replaces all tags by them (there is no option to take some away), `infos` `{"link_id_a": [1, 2, 3]}` as JSON. From the add-on it answered 500 (an error page), even for one tag on one bookmark, just as the site sends it (October 2026); Bulk edit then saves each bookmark with `/item/save/bookmark` |

Also in the app's code, not tried:

| request                                    | what                                        |
|--------------------------------------------|---------------------------------------------|
| `/interact_api/load_user_item`             | one item                                    |
| `/interact_api/search_user_items`          | search the library                          |
| `/interact_api/edit_item_tags`             | change the tags of an item                  |
| `/interact_api/load_user_groups`           | your groups                                 |
| `/item/save/kindle` | save an edited Kindle item          |
| `/ditem_outliner/add_to_outliner`          | add items to an outliner (`infos`: `{link_id_a, list_id_a}`) |
| `/ditem_outliner/add_text_to_outliner`     | add text to an outliner (JSON: `{text, outliner_id}`) |
| `/outliner/new`                            | create an outliner                          |
| `/toolbar_server_v13`                      | the toolbar API, also used by the site      |

The add-on itself (`background/background.js`) talks to the toolbar API on `toolbar3.diigo.com` instead.

## Hidden tags on diigo.com

`diigo-site/hide-page.js` runs in the page itself (`world: MAIN`, at `document_start`) and changes the answers of
`load_user_items` and `search_user_items` (out: the items with a hidden tag in `t_name`) and `load_user_tags` (out: the
hidden tags) when the library reads them, from `XMLHttpRequest` (`responseText`, `response`) or `fetch`; a request
with a hidden tag in its parameters (a search for it) stays as it is. What is hidden it gets from `diigo-site/hide.js`:
`localStorage.swiftHiddenTags` (`{user, tags}`) and a `swift-hidden-tags` event. Not verified yet, as diigo.com was
behind a Cloudflare check when this was written (November 2026): the form of the answer of `load_user_tags` (the filter
takes a list of names, of objects with a `name`, `tag`, `tag_name` or `title`, or an object by name), which of the two
the library uses, and whether it stops loading pages when one comes back shorter than `count`. `hide.js` also hides a
`.ListItem` with a hidden tag in `.tags .Tag .wrapper`, for one that comes another way.

## Outliners

Diigo's outliner is an app of its own at `/outliner`, which the library shows in a frame (`/outliner/<code>/<title>`,
`<code>` the id as `(1234 * id + 98765).toString(36)`). Its code is public: `/outliner/w/scripts/wp.<hash>.js` and
`/outliner/javascripts/main.js` (read November 2026, from a shared outliner). Outliners in the Swift Library (`options/library-outliners.js`)
talks to it as that app does, with the sign-in of diigo.com and `X-Requested-With: XMLHttpRequest`; answers are JSON
with `code: 1`.

| request | what |
|---------|------|
| `GET /outliner/list` | your outliners, in `data.outliners`: `outliner_id`, `title`, `created_at`, `updated_at` (seconds) |
| `POST /outliner/new`, `title` | a new outliner; the answer has it in `outliner` |
| `POST /outliner/<id>/edit`, `title`, `description` | rename it (form fields, as the library sends them) |
| `POST /outliner/<id>/delete` | delete it |
| `GET /outliner/<id>` (`?key=` for a shared one) | the outliner: `data.meta` (`title`, `max_action_id`, `version_id`, `share_key`...), `data.user` (`user_id`, `permission`: `["read"]` also for an outliner of your own (November 2026), so the add-on takes one in your `/list` as yours to change), `data.bulletpoints` (each item: `bullet_client_id`, `parent_client_id` (0 at the top), `position` (the order under its parent), `content` and `description` (HTML), `expand` (0 or 1)) and `data.actions`, changes not worked into those yet |
| `GET /outliner/bullet_client_id_prefix?t=<time>` | `prefix`: a new item's id is it with a number of 10 digits after it |
| `POST /outliner/<id>/actions` | the changes, as JSON: `{client_max_action_id, client_version_id, actions: [{data: [changes], c_key, timeStamp, __actionIndex}], s_key}`, `s_key` the MD5 of `JSON.stringify(actions)`, `c_key` a key of the page. A change is `{type: create, edit, move or delete, data: {bullet_client_id, parent_client_id, index, content, description, expand}}`; `index` is the place under the parent (for a move, after it was taken out). The answer has `data.actions`, all changes since `client_max_action_id` (also those of other pages: another `c_key`), and `data.server_version_id`. Diigo's app sends an empty one every 30 seconds to hear what changed elsewhere |

In `content`, an item of your library is a `<span class="diigoItemFlag">` with JSON in it: `title`, `type`, `url`,
`linkId`, `userId`, `annotCount`, `isConvert`. Diigo's app leads to one that isn't a bookmark at
`/outliner/diigo_items/<outliner id>/<userId>/<linkId>`.

## The menu of your name

At the top right of the library, your name opens a menu: Public Library (`/profile/<name>`), Settings (`/setting`),
Support (`/common/contact`), Discover (`/buzz/hot`), Help (`/help`, which leads to help.diigo.com) and Sign
Out (`/sign-out`). The add-on draws the same menu in the Swift Library and Swift Discover (`options/user-menu.js`), with
Swift Discover for Discover. The addresses were checked signed out (November 2026): each exists, or leads to sign in.

Public Library is a route of the React app (`profile/:name`, a `Link`): loaded as a page, `/profile/<name>` is the
old classic page the server draws. The add-on leads to `/user/<name>#dqa-public-library` instead, and
`diigo-site/public-library.js` clicks that link of the menu there.

## Hot Bookmarks (Discover)

`/buzz/hot` is an older page that Diigo draws on its server, the same for everyone, signed in or not (November 2026).
Swift Discover (`options/discover.js`: `parseBuzz`) reads it as HTML:

* `?count=100&page_num=0`: 20, 50 or 100 per page (the menu at the bottom sets a cookie; `count` in the address works
  too), `page_num` from 0. The pagination at the bottom has `Next ›` while there is a next page.
* each bookmark is a `.ditemItem`: `.savePeopleCount strong` how many people saved it, `a.titleLink` its title and web
  address, `.desc .content` a description (mostly empty), `span#tags_<n> a` its tags (often a few words each), and
  `.nothers`: `first saved by <a href="/user/<name>">` (or `Saved by` when only one did) `on Nov 12, 26`
* Preview (`switchPreview`) shows the page in a frame, which most sites refuse.
* `/buzz` and `/buzz/new` are 404; `/tag/<tag>` is a page of its own without these items.

diigo.com is behind Cloudflare: after many requests in a short time it answers with a challenge ("Just a moment...",
status 403) instead of the page, until a browser passes it on diigo.com itself.
