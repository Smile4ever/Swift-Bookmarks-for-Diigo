# Swift Bookmarks for Diigo

A browser add-on that saves the page you're on, or a link, as a bookmark in your [Diigo](https://www.diigo.com) library.

[Install for Firefox][] (Firefox 140 or newer, also on Android), [install for Chrome][] (Chrome 121 or newer) or [install for Edge][] (Edge 121 or newer).

On Firefox for Android the button is in the menu of Firefox; there is no right-click menu and no shortcut there.

[Install for Firefox]: https://addons.mozilla.org/firefox/addon/swift-bookmarks-for-diigo/
[Install for Chrome]: https://chromewebstore.google.com/search/Swift%20Bookmarks%20for%20Diigo
[Install for Edge]: https://microsoftedge.microsoft.com/addons/search/Swift%20Bookmarks%20for%20Diigo

**Unofficial**: this add-on is not made by Diigo and is not an official Diigo add-on. It is an alternative to Diigo's
own add-on, made for one thing: bookmarking, quickly and well.

Find it useful? [Donate via PayPal](https://paypal.me/Smile4ever/10).

## Made for bookmarks

* **Tags that come to you**: your own tags that appear in the title, the URL or the keywords of the page are suggested,
  and so are the tags of your last bookmark on the same site; while you type, the tags you most often use together with
  them (Often with these); an autocomplete and a cloud of your 100 most used tags for the rest.
* **Less to fill in**: a new bookmark gets the description the page gives of itself (when no text is selected), is saved
  without tracking parameters (utm_…, fbclid) and at the web address the page calls its own (canonical), and gets what
  your rules for its site say: tags, private or public, read later or not.
* **No bookmark twice**: the form says when you saved the page before at nearly the same web address, with a way to
  edit that one instead.
* **Hidden tags**: tags you don't want to see in suggestions, and whose bookmarks stay out of your library unless you search for such a tag.
* **Swift Library**: your whole library as a page of the add-on, from that same copy in the browser: search on the field
  you choose, sort, filter by tag and site, and the tags of what you see at the left, at once, also with thousands of
  bookmarks. Edit there too, and add bookmarks, images, PDFs and notes as on diigo.com, and put back what you deleted from its trash; hidden tags stay hidden.
* **Filters and Bulk edit** in the Swift Library: the search box searches the field you choose (title, URL,
  description, tag, site), -word for what may not be there, a filter for when they were saved, and adding or removing
  tags, public or private, read or unread, or deleting for all bookmarks you tick at once, also in thousands.
* **Your bookmarks in the address bar**: type `d`, a space and a few words, and the bookmarks of your library with
  them are suggested, from the copy in the browser; Enter on the words searches them in the Swift Library.
* **You see what's saved**: the toolbar icon shows whether the page is already in your library, and the form opens with
  what you saved before, when you saved it and a Delete button.
* **Nothing gets lost**: the form only closes once Diigo has saved the bookmark; otherwise it says why and keeps what you typed.
* **Save a link** with the title of the page it points to, from the right-click menu.
* **Clean up**: on Start of the Swift Library, Similar tags (e-mail and email, recipe and recipes) to merge in one go,
  dead links to mend with their latest copy in the Wayback Machine or a dead-link tag, and what has been waiting to be
  read for over 3 months, to read or mark read.
* **Swift Discover**: the Hot Bookmarks of the Diigo community as a page of the add-on, without what is in your library
  already, in the order For you (by your own tags), with a search box, filters by tag and site, Not interested, and Save
  with the bookmark form.
* **Dead links** in the Swift Library: the status of each link (200, 404...), with a way into the Wayback Machine and
  archive.is.
* **Your browser's bookmarks to Diigo**: the folders you choose, once or kept in sync, with the folder names as tags, and your tags that the title or web address mentions, as the form suggests them; in
  Firefox also Save to Diigo and Move to Diigo in the menu of a bookmark or folder. One way only: what you change or
  remove in the browser stays as it is in Diigo.

Highlighting, sticky notes and screenshots are not in this add-on; for those there is Diigo's own add-on.

The add-on doesn't change how diigo.com looks and works: what it does better is in the Swift Library and Swift Discover.
On diigo.com it only adds the way there: Go to Swift Library at the end of the menu at the top, which Diigo's own items keep as they are. The trash of
the Swift Library is kept in this browser only, so it isn't shown on diigo.com; what you delete there goes to it all the
same, to put back in the Swift Library.

## How to use it

* The toolbar button, or Ctrl+Alt+D in Firefox and Alt+Shift+D in Chrome and Edge, opens the bookmark form on the page:
  title, URL, description, tags, Share to group, Share to outliner, Private and Read later. Press it again, or Esc, to close it.
* Right-click a page or a link → Save page to Diigo / Save link to Diigo.
* In the address bar, `d`, a space and words: your bookmarks with those words (in the title, URL, description or tags),
  the newest first; Enter on the words themselves searches them in the Swift Library. Only bookmarks, not notes, images
  or PDFs, and those with a hidden tag only when you type that tag. From the index of the Swift Library, so open that once
  first. The keyword `d` can't be changed: browsers take it from the manifest. Not on Firefox for Android.
* Right-click the toolbar button → Swift Library, Swift Discover, Random bookmark (the page of one of your bookmarks, at random, in a new tab, with its bookmark form on it), and
  Options (in Firefox; Chrome and Edge have Options there themselves).
* The toolbar icon shows whether the page is already in your library. For that the add-on asks diigo.com about every
  page you open while you're signed in. On pages it can't bookmark (browser pages, local files, and the add-on stores,
  where add-ons aren't allowed) the button is grey.

You sign in on [diigo.com](https://www.diigo.com/sign-in); the add-on uses that session (the `diigoandlogincookie`
cookie). When you're signed out, the button opens the sign-in page.

## The Swift Library

A copy of your library is kept in the browser (the index), built once (about a minute for 16,000 bookmarks) and then
updated with only what changed. What you save or delete on diigo.com is in it a second later. Its state, Update and
Build again are in Swift Options, with the Swift Library.

**Search**: each word has to be there, `"between quotes"` is one, `-word` may not be there, `""` is an empty field
(`-""` one that isn't); in Tag, `tag*` finds every tag that starts so. Next to the order: public or private, and when it
was saved. `+` keeps the search as a filter above the list; a click on a filter takes it away. Ctrl+F (Cmd+F) puts the
cursor in the search box. What is shown stays in the address.

**Start** has blocks instead of one long list: Recently saved, Recently shared, To read, Random, On this day, the trash,
and Clean up:

* **Similar tags**: tags that are nearly the same (e-mail and email, recipe and recipes) to merge into one, in Diigo too;
  Not the same leaves a group out from then on.
* **Without a title**: no title, the web address as title, or Untitled and the like; Fetch titles asks each page for its own.
* **To read for over 3 months**: unread bookmarks older than 3 months, to read or mark read.
* **Dead links** (pages that are gone and sites that don't answer, as in the side bar), **Moved**, **Duplicates** and **Untagged**, each a click away.

**Dead links**: with the option on (the default), each bookmark gets the status of its page before its title. A page
that works is checked again after a week, one that is gone after 3 days, anything else after a day; Check all links
in Dead links checks the whole library at once.

| code | meaning |
|------|---------|
| 200 | the page works |
| red 404, 410 (title struck through) | the page is gone; also a page that leads to the home page of its site, or whose title says it isn't found |
| ERR | the site doesn't answer |
| PARKED | the domain is parked or for sale |
| → | the page moved for good to another web address |
| BOT | a bot protection (Cloudflare and the like) refused the check; the page may well work in a tab |
| grey 429 | the site asked to wait (Too Many Requests); it is asked again later |
| grey, struck through | you said Not dead, for this link or its whole site |

A click on the code: the Wayback Machine or archive.is, Search the title on Google, Use the latest copy in the Wayback
Machine, Use the new web address, Tag it dead-link, and Not dead or Count as dead again. The add-on reads the start of
each page up to its title (32 KB at most), without cookies; a site that answers 429 is left alone as long as it asks
(Retry-After, else a minute, at most ten).

**Notes, images and PDFs**: a click on the title of a note or an image shows it in the Swift Library; Ctrl+click or the
middle button opens it on Diigo, as does the title of a PDF or a Kindle item. A note whose title ends in `.py`, `.js`,
`.css`, `.html`, `.sql`… is code: edited in a font for code, in colours, with Tab. Notes, images and PDFs can be edited.

**Delete and the trash**: Delete asks nothing. The item goes to the trash at once, and Diigo deletes it 30 seconds
later; Put back in that time simply cancels it. The trash keeps a copy for 30 days, also of what you delete on diigo.com.
Put back makes a bookmark again with today's date (without its highlights), a note as a new note, and an image or a PDF
from its file, when the trash could keep it.

**Tags**: ✎ next to a chosen tag in the side bar renames it on all your items. Hidden tags, and the tag `hidden`, keep
their bookmarks out of the Swift Library, the address bar and Swift Discover unless you search for that tag in full.

## Swift Discover

The Hot Bookmarks of the Diigo community, 300 at a time and kept for an hour, without what is in your library already.
For you orders them by how many of your own tags are in them; one with one of your 30 most used tags, or with two of
your tags, has a yellow line and a flag. Also Hot, Most saved and Newest first, a search box, filters by tag and site,
Save (the bookmark form) and Not interested (Show dismissed to undo).

## Outliners, in the Swift Library

Your outliners of Diigo are in the Swift Library too: Outliners in the side bar, a kind under All as Notes. They show as
the bookmarks do, the last changed first, each with its first 10 lines, Edit (which opens it) and Delete; the search box
finds them by their name, and Add → Outliner makes a new one. One opened is its name, written in the page, and its items
as a tree: Enter makes a new item, Tab and Shift+Tab move it in and out, Shift+Enter writes its note, Alt+Shift+↑↓ moves
it, Backspace on an empty item deletes it, and × at its right or Ctrl+Shift+Backspace deletes any item (asking first
when there are items under it). From your library adds items of the index as links. Changes are saved on Diigo a moment
later, and what changes elsewhere is loaded again.

Delete puts an outliner in the trash, as a bookmark: Diigo deletes it 30 seconds later, and till then Undo or Put back
simply cancels it. After that the trash keeps its name and items for 30 days, and Put back makes it again on Diigo (as a
new outliner: a link to the old one, or its sharing, doesn't come back). My Outliners, Diigo's own page, stays in the
menu at the top of diigo.com.

## Shortcuts

Also listed on the options page, with the shortcut your browser uses.

In the bookmark form:

| keys | what |
|------|------|
| Ctrl+Alt+D (Firefox), Alt+Shift+D (Chrome, Edge) | open or close the form; change it in the extension settings of the browser |
| Enter in Tags | save |
| Ctrl+S or Alt+S | save, in any field |
| ↑ / ↓, then Enter or Tab | pick a suggested tag |
| Esc | close the suggested tags, then the form |

## Log

What goes wrong in the add-on (Diigo not saving, the sync, the index, the Swift Library…) is kept in a log: Log on the
options page, the newest first, with a filter and Clear log. It is kept in memory only (storage.session), so it is empty
after a browser restart. Save log for a bug report saves the errors shown with the version, browser and settings (not
your hidden tags, rules per site and folders), to attach to an issue on GitHub. Nothing is sent anywhere by itself.

## Privacy

The add-on sends nothing to its maker. It talks to diigo.com for you: while you're signed in it asks Diigo whether each
page you open is in your library, and it sends Diigo the bookmarks you save. With the option for dead links on, it
requests the page of each bookmark in the Swift Library from its own site, and reads its start up to its title, to show
whether it still exists, moved or is parked; with Check links by themselves off (Swift Options, Privacy) only when you
ask for it: a click on its ·, Check all links, or looking for dead links in the side bar. Swift
Discover loads the Hot Bookmarks from diigo.com (diigo.com/buzz/hot), and keeps them and what you said Not interested
to in the browser. Use the latest copy in the Wayback Machine, for a dead link in the Swift Library, asks archive.org for
the copy of that one page, only when you choose it. For a link you save from the right-click menu, the add-on requests
that page itself, for its title, description and keywords. When you delete something on diigo.com, the add-on reads
which items Diigo deletes from that request (delete_b), to take them out of the index too.
Only when you allow access to your bookmarks on the options page, it reads them, and sends Diigo those of the folders you
choose, and those you save or move to Diigo from the menu of a bookmark.
The Swift Library keeps a copy of your library (titles, URLs, descriptions, tags) in the browser, on your computer
only; it goes when you remove the add-on. Built again, what it had and Diigo no longer gives goes to its trash, for 30
days.
The settings of Swift Options are kept with the account of the browser (storage.sync: Firefox Sync, the Google or
Microsoft account) when it syncs, so your other computers get them too, and a copy in this browser; the folders to sync
stay on this computer. So do the links you said are not dead, the similar tags you said are not the same and Not
interested in Swift Discover. A setting or list too large for storage.sync (8 kB: a long list of rules per site, many
Not interested) stays in this browser only. Firefox syncs this only with Add-ons ticked in Firefox Sync.

## Folders

```
manifest.json   works in Firefox, Chrome and Edge as it is; scripts/build.js makes one per browser
background/     background.js: sign-in, the Diigo API (toolbar3.diigo.com), toolbar icon, button, shortcut, right-click
                menu, dead links; sync.js: bookmarks of the browser to Diigo (options page, menu of a bookmark), in a
                queue in storage; chrome-sw.js: loads settings.js, background.js and sync.js as the service worker of
                Chrome and Edge
content/        content.js: put in the page when the form opens; shows the form in an iframe and removes it again
form/           form.html, form.js, form.css: the bookmark form; asks background.js to open, save or delete a bookmark
diigo-site/     on www.diigo.com, in the order of manifest.json: common.js: what they share; delete-window.js: what
                Diigo's delete window deletes goes to the trash of the Swift Library; header.js: Go to Swift Library at the end of the menu at the top, Diigo's own items as they are,
                and My Library and Tools opening the Swift pages when chosen; diigo-site.js, last: runs them as the page changes; diigo-site.css: their looks
options/        options.html, options.js, options.css: the options page: hidden tags, what the bookmark form fills in and
                the rules per site, the folders to sync, each diigo.com improvement on or off, the shortcuts; settings.js: the settings and their defaults, also loaded by the
                form, the scripts of diigo-site/ and the background scripts; library-index.js: the index of the library
                in IndexedDB, index-item.js: an item of it, also for the background scripts; library.html,
                library.css: the Swift Library, with its filters and Bulk edit; its scripts, in the order of
                library.html: library.js (what they share, the index), library-search.js (what is shown, the search
                box, the filters), library-list.js, library-links.js (dead links, the archives), library-trash.js
                (the trash, duplicates), library-edit.js, library-add.js, library-bulk.js, library-delete.js (deleting after 30 seconds, from the trash),
                library-side.js (the side bar, the menu at the top), library-tags.js (Similar tags, to merge), library-code.js
                (notes that are code, in colours), user-menu.js (the menu of your name, also in Swift Discover),
                library-home.js (Start: blocks instead of one list), library-outliners.js (your outliners of Diigo,
                with md5.js and outliners.css)
                and library-page.js (the events, and the start); discover.html, discover.js, discover.css: Swift
                Discover, the Hot Bookmarks of diigo.com/buzz/hot, with library.css and the index; guide.html,
                guide.js, guide.css: Swift Guide, what the add-on does more than Diigo, opened once when it is
                installed, with the pictures of images/store
icons/          add-on and toolbar icons: icon.svg (also the favicon of the options page and the Swift Library) and
                toolbar-saved.svg, toolbar-busy.svg, toolbar-library.svg (a page that can't be bookmarked: the button opens
                the Swift Library) and toolbar-options.svg (on diigo.com) are the
                drawings; the PNGs are made from them (48 and 128 px for the add-on, 19 and 38 px for the toolbar)
_locales/       the texts: English (en), Dutch (nl), German (de), French (fr), Spanish (es), Italian (it),
                Brazilian Portuguese (pt_BR), Polish (pl), Russian (ru), Japanese (ja), Simplified Chinese (zh_CN)
scripts/        build.js: the builds; changelog.js: the release notes of a version, from CHANGELOG.md
test/           tests of the background script, the builds, the texts and the changelog (npm test)
docs/           diigo-com.md: how www.diigo.com works: Diigo's three APIs, the site's code, item types, the edit form,
                its requests, the page of the Hot Bookmarks; diigo-bugs.md: what Diigo does wrong that the add-on works around, in short; store-listing.md:
                the texts for the add-on stores
```

The scripts use `browser.*`; for Chrome and Edge, which only have `chrome.*`, the first script of every page sets
`globalThis.browser` to `chrome` (`background.js`, `content.js` and `options/settings.js`).

In `form.html`, `data-i18n="key"` sets an element's text and `data-i18n-title="key"` its tooltip. A new text goes in every
language: English and Dutch by hand, the others are machine-made translations (by Claude) that a native speaker hasn't
checked yet. Names of buttons on diigo.com itself (Edit, Bulk Edit, Share to group...) stay in English, as the site is in
English. The description of the add-on (`extDesc`) is at most 132 characters, the limit of the Chrome Web Store.

## Try and build

Load it without building:

* Firefox: `about:debugging` → This Firefox → Load Temporary Add-on → `manifest.json`
* Chrome: `chrome://extensions` → Developer mode → Load unpacked → this folder
* Edge: `edge://extensions` → Developer mode → Load unpacked → this folder

```sh
npm test               # the tests, with Node.js only
npm run build          # web-ext-artifacts/swift_bookmarks_for_diigo-<version>.firefox.zip and .chrome.zip (also for Edge)
npm run lint:firefox   # Mozilla's add-on linter, on the Firefox build
```

The Firefox build differs from the repository in its manifest only: no service worker. The Chrome build has no
Firefox settings, and Alt+Shift+D as its shortcut, as Chrome and Edge don't allow Ctrl+Alt shortcuts.

## Release

1. Version in `manifest.json` and `CHANGELOG.md`: the date without leading zeros (`2026.11.5`); a second release that
   day gets a fourth number (`2026.11.5.1`).
2. `npm test` passes and `npm run lint:firefox` has no errors.
3. Check in Firefox and Chrome: signed out, the button opens the sign-in page; signed in, the button and the shortcut
   open and close the form; a tag in the page title is suggested; a saved bookmark shows again when the form reopens;
   Save link to Diigo works on a link with `&` in the URL.
4. Push to `main`: GitHub Actions ([ci.yml](.github/workflows/ci.yml)) runs the tests and the linter, builds both zips
   and makes a GitHub release with the notes of that version in `CHANGELOG.md`, unless the version has one already.
5. Upload the zips: the `.firefox.zip` to [addons.mozilla.org](https://addons.mozilla.org/developers/), the
   `.chrome.zip` to the [Chrome Web Store](https://chrome.google.com/webstore/devconsole) and to
   [Microsoft Edge Add-ons](https://partner.microsoft.com/dashboard/microsoftedge/). The texts are in
   [docs/store-listing.md](docs/store-listing.md).
