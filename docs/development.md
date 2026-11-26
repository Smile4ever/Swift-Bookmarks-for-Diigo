# Development

The technical side of Swift Bookmarks for Diigo: how it is put together, how to try and build it, and how a release
goes. What the add-on does for you is in the [README](../README.md).

## How it works

* **Sign-in**: the add-on uses your session on diigo.com (the `diigoandlogincookie` cookie) and follows it at once when
  you sign in, out or as someone else. Signed out, the toolbar button opens the sign-in page.
* **The index**: the Swift Library keeps a copy of your library in IndexedDB, built once (about a minute for 16,000
  bookmarks) and then updated with only what changed. What you save or delete on diigo.com is in it a second later:
  the add-on reads which items Diigo's delete window deletes (`delete_b`). Built again, what it had and Diigo no longer
  gives goes to its trash, for 30 days.
* **The toolbar icon** asks diigo.com about every page you open while you're signed in, to show whether it's in your
  library.
* **Dead links**: the add-on reads the start of each page up to its title (32 KB at most), without cookies; a site that
  answers 429 is left alone as long as it asks (`Retry-After`, else a minute, at most ten).
* **Hidden tags on diigo.com**: `diigo-site/hide-page.js` runs in the page itself and takes the items with a hidden tag
  out of the answers Diigo's library gets. Their names are kept in the `localStorage` of diigo.com in this browser, so
  the page knows them at once.
* **PDFs**: Diigo gives a PDF's file only to its own signed-in page. A PDF opened from the Swift Library opens its page
  on diigo.com with `#swift-pdf`; `diigo-site/pdf-view.js` then opens the PDF's blob in that tab, in the browser's own
  PDF viewer.
* **Settings** are kept with `storage.sync` (Firefox Sync, the Google or Microsoft account) and a copy in
  `storage.local`. A setting or list too large for `storage.sync` (8 kB) stays in this browser only. The folders to
  sync stay on each computer.
* **The log** is kept in `storage.session`, so it is empty after a browser restart.
* **The address bar** keyword `d` can't be changed: browsers take it from the manifest.

How diigo.com itself works (its three APIs, item types, the edit form, its requests) is in
[diigo-com.md](diigo-com.md); what Diigo does wrong that the add-on works around is in [diigo-bugs.md](diigo-bugs.md).

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
                Diigo's delete window deletes goes to the trash of the Swift Library; header.js: Go to Swift Library at
                the end of the menu at the top, Diigo's own items as they are, and My Library and Tools opening the
                Swift pages when chosen; public-library.js: Public Library from the pages of the add-on; hide.js: what
                has a hidden tag out of your library there, and Show hidden, with hide-page.js, which runs in the page
                itself and filters Diigo's answers; pdf-view.js, also in the page itself: a PDF opened from the Swift
                Library shown in the browser's PDF viewer; diigo-site.js, last: runs them as the page changes;
                diigo-site.css: their looks
pages/        options.html, options.js, options.css: Swift Options; settings.js: the settings and their defaults, also
                loaded by the form, the scripts of diigo-site/ and the background scripts; ask.js, ask.css: the
                question before something is done, instead of confirm(); library-index.js: the index of the library in
                IndexedDB, index-item.js: an item of it, also for the background scripts; library.html, library.css:
                the Swift Library, with its filters and Bulk edit; its scripts, in the order of library.html:
                library.js (what they share, the index), library-search.js (what is shown, the search box, the
                filters), library-list.js, library-links.js (dead links, the archives), library-trash.js (the trash,
                duplicates), library-edit.js, library-add.js, library-bulk.js, library-delete.js (deleting after 30
                seconds, from the trash), library-side.js (the side bar, the menu at the top), library-tags.js (Similar
                tags, to merge), library-code.js (notes that are code, in colours), user-menu.js (the menu of your
                name, also in Swift Discover), library-home.js (Start: blocks instead of one list),
                library-outliners.js (your outliners of Diigo, with md5.js and outliners.css) and library-page.js (the
                events, and the start); discover.html, discover.js, discover.css: Swift Discover, the Hot Bookmarks of
                diigo.com/buzz/hot, with library.css and the index; guide.html, guide.js, guide.css: Swift Guide, opened
                once when the add-on is installed, with the pictures of images/store and images/guide; tools.html,
                tools.js: Swift Tools, Diigo's Tools page as a page of the add-on
icons/          add-on and toolbar icons: icon.svg (also the favicon of the pages of the add-on) and toolbar-saved.svg,
                toolbar-busy.svg, toolbar-library.svg (a page that can't be bookmarked: the button opens the Swift
                Library) and toolbar-options.svg (on diigo.com) are the drawings; the PNGs are made from them (48 and
                128 px for the add-on, 19 and 38 px for the toolbar)
images/         store/: the pictures of the add-on stores, also in Swift Guide and the README; guide/: those only in
                Swift Guide; both made by scripts/screenshots.mjs
_locales/       the texts: English (en), Dutch (nl), German (de), French (fr), Spanish (es), Italian (it),
                Brazilian Portuguese (pt_BR), Polish (pl), Russian (ru), Japanese (ja), Simplified Chinese (zh_CN)
scripts/        build.js: the builds; changelog.js: the release notes of a version, from CHANGELOG.md;
                screenshots.mjs: the pictures of images/, with a made-up library
test/           tests of the background script, the builds, the texts and the changelog (npm test)
docs/           diigo-com.md: how www.diigo.com works; diigo-bugs.md: what Diigo does wrong that the add-on works
                around, in short; store-listing.md: the texts for the add-on stores; development.md: this file
```

The scripts use `browser.*`; for Chrome and Edge, which only have `chrome.*`, the first script of every page sets
`globalThis.browser` to `chrome` (`background.js`, `content.js` and `pages/settings.js`).

In the HTML pages, `data-i18n="key"` sets an element's text and `data-i18n-title="key"` its tooltip. A new text goes in
every language: English and Dutch by hand, the others are machine-made translations (by Claude) that a native speaker
hasn't checked yet. Names of buttons on diigo.com itself (Edit, Bulk Edit, Share to group...) stay in English, as the
site is in English. The description of the add-on (`extDesc`) is at most 132 characters, the limit of the Chrome Web
Store.

## Try and build

Load it without building:

* Firefox: `about:debugging` → This Firefox → Load Temporary Add-on → `manifest.json`
* Chrome: `chrome://extensions` → Developer mode → Load unpacked → this folder
* Edge: `edge://extensions` → Developer mode → Load unpacked → this folder

Loaded like this, Swift Tools has a **Limit test** at the bottom (`pages/tools-test.js`): it saves the number of
bookmarks you choose to the Diigo account you're signed in with, as the bookmark form saves them (private, at
`https://example.com/swift-limit-test/<n>`, tagged `swift-limit-test`), and stops at the first one Diigo doesn't
save, with what Diigo answered. The numbers go on where the last run stopped (kept per account in this browser; Start
at changes it). For finding the limits of a free account. Delete them afterwards in the Swift Library:
search for the tag, Bulk edit, Delete. An installed add-on doesn't show it.

```sh
npm test               # the tests, with Node.js only
npm run build          # web-ext-artifacts/swift_bookmarks_for_diigo-<version>.firefox.zip and .chrome.zip (also for Edge)
npm run lint:firefox   # Mozilla's add-on linter, on the Firefox build
npm run screenshots    # images/store and images/guide, with a made-up library (Puppeteer)
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
4. Push to `main`: GitHub Actions ([ci.yml](../.github/workflows/ci.yml)) runs the tests and the linter, builds both zips
   and makes a GitHub release with the notes of that version in `CHANGELOG.md`, unless the version has one already.
5. Upload the zips: the `.firefox.zip` to [addons.mozilla.org](https://addons.mozilla.org/developers/), the
   `.chrome.zip` to the [Chrome Web Store](https://chrome.google.com/webstore/devconsole) and to
   [Microsoft Edge Add-ons](https://partner.microsoft.com/dashboard/microsoftedge/). The texts are in
   [store-listing.md](store-listing.md).
