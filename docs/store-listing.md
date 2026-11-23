# Store listing

The texts for [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/swift-bookmarks-for-diigo/) (AMO), the
[Chrome Web Store](https://chrome.google.com/webstore/devconsole) and
[Microsoft Edge Add-ons](https://partner.microsoft.com/dashboard/microsoftedge/). Upload
`swift_bookmarks_for_diigo-<version>.firefox.zip` to AMO and `.chrome.zip` to both other stores.

## Name

Swift Bookmarks for Diigo

## Summary

All stores (Chrome allows 132 characters, Firefox 250). It is `extDesc` in `_locales/en/messages.json`, which the
stores also show in the other languages:

> Save pages and links to your Diigo library fast, with suggested tags. An unofficial alternative to Diigo's add-on.

## Category

* AMO: Bookmarks
* Chrome Web Store: Productivity → Tools
* Edge: Productivity

## Links

* Homepage: https://github.com/Smile4ever/Swift-Bookmarks-for-Diigo
* Support: https://github.com/Smile4ever/Swift-Bookmarks-for-Diigo/issues
* Donations (AMO: "Contributions URL"): https://paypal.me/Smile4ever/10
* License (AMO asks on the first upload): GNU General Public License v2.0 or later, see [LICENSE.md](../LICENSE.md)

## Screenshots

In [images/store](../images/store): 1280×800, English, made with the Chrome build by `npm run screenshots`
(`scripts/screenshots.mjs`), which plays Diigo with a made-up library, so no account is needed. Diigo's own images
(its logo, the icons of the side bar, the avatar) come from `scripts/screenshot-assets/` (`logo_s2@2x.png`,
`icons@2x.png`, `default_avatar.jpg`, saved from a browser: diigo.com refuses them to a script). The Chrome Web Store
shows at most 5, Edge at most 10, AMO all of them.

The same script makes the pictures of Swift Guide that are not in the stores, in [images/guide](../images/guide):
the cloud of All tags, Similar tags and an outliner. `node scripts/screenshots.mjs guide` makes only those, and
leaves the store ones as they are.

| File | Caption |
|---|---|
| 1-form.png | The bookmark form on the page: your tags that appear in the title are suggested; one click adds them. |
| 2-saved.png | A page that is already in your library: the form shows what you saved, and when. |
| 3-tag-cloud.png | Your 100 most used tags, the more used the larger. |
| 4-library.png | The Swift Library: your whole Diigo library at once, with the status of each link (200, 404). |
| 5-discover.png | Swift Discover: the Hot Bookmarks of the Diigo community, without what you have, in the order For you. |
| 6-archive.png | Click the status code of a dead link to look it up in the Wayback Machine or on archive.is. |

## Description for addons.mozilla.org

AMO uses a limited Markdown (bold, italic, `monospace`, links, lists); HTML is shown as plain text.

````markdown
Save the page you're on, or a link, to your Diigo library in a few keystrokes: press **Ctrl+Alt+D**, check the suggested tags, press **Enter**.

**This add-on is not made by Diigo.** It is an unofficial alternative to Diigo's own add-on, made for one thing: bookmarking, quickly and well. It uses your sign-in on diigo.com.

**Why I made it**

Diigo's own add-on does a lot more than bookmarking, but it didn't help me add bookmarks fast. I wanted to save a page in a few keystrokes, with my own tags suggested, and a library on diigo.com that's quicker to work with.

**Made for bookmarks**

- **Tags that come to you**: your own tags that appear in the title, the URL or the keywords of the page are suggested ("Machine Learning" suggests `machine-learning`), and so are the tags of your last bookmark on the same site. While you type, the tags you most often use together with them. An autocomplete and a cloud of your 100 most used tags for the rest.
- **Less to fill in**: a new bookmark gets the description of the page, a clean web address without tracking parameters, and what your rules for its site say (tags, private, read later).
- **No bookmark twice**: the form says when you saved the page before at nearly the same web address.
- **You see what's saved**: the toolbar icon shows whether the page is already in your library. The form then opens with your title, description and tags, and says when you saved it.
- **Nothing gets lost**: the form only closes once Diigo has saved the bookmark. If it can't, it says why and keeps what you typed.
- **Save a link** from the right-click menu, with the title of the page it points to.
- Title, URL, description, tags, **Private** and **Read later**, and **share to a group or an outliner**. Text you selected on the page becomes the description.
- **Hidden tags**: tags you don't want to see in suggestions, and whose bookmarks stay out of your library unless you search.

**Your Firefox bookmarks to Diigo**

- Choose folders on the options page and put their bookmarks in Diigo once, or keep them in sync: a new bookmark goes to Diigo a minute after you make it.
- Folder names become tags, and so do your own tags that the title or web address mentions, as the form suggests them. Bookmarks that are already in Diigo stay as they are.
- Right-click a bookmark or folder: **Save to Diigo**, or **Move to Diigo**, which removes it from Firefox once it's in Diigo.
- Only if you allow access to your bookmarks, on the options page.

**Swift Library and Swift Discover**

- **Swift Library**: your whole Diigo library as a page of the add-on, searched, sorted and filtered at once, also with thousands of bookmarks. Edit, Bulk edit, rename a tag, and a trash to put back what you deleted.
- **Notes, images and PDFs** too: add them as on diigo.com, read a note right there (code in colours), and edit it.
- **Clean up on Start**: similar tags to merge, bookmarks without a title to fetch it for, unread bookmarks older than 3 months, and links that moved or died.
- The status of each link (200, 404) before its title, also for all links at once. Click it to look up a dead page in the Wayback Machine or on archive.is, use its latest copy or its new web address, or search its title.
- **Swift Discover**: the Hot Bookmarks of the Diigo community, without what is in your library already, in the order For you (by your own tags), with a search box, filters by tag and site, and Not interested.

The add-on doesn't change diigo.com itself: it only adds the way there, Go to Swift Library in the menu at the top.

**Not in this add-on**

Highlighting and sticky notes: for those there is Diigo's own add-on.

**Privacy**

The add-on sends nothing to its maker. It talks to diigo.com for you: while you're signed in it asks Diigo whether each page you open is in your library, and it sends Diigo the bookmarks you save. With the option for dead links on (the default), it requests the page of each bookmark in the Swift Library from its own site. Swift Discover loads the Hot Bookmarks from diigo.com. It only reads your Firefox bookmarks when you allow it on the options page, and only sends Diigo those of the folders you choose, or that you save or move to Diigo.

**Languages**

English, Dutch, German, French, Spanish, Italian, Brazilian Portuguese, Polish, Russian, Japanese and Simplified Chinese.

**Bug reports and ideas**

On [GitHub](https://github.com/Smile4ever/Swift-Bookmarks-for-Diigo/issues). Find it useful? [Buy the maker a treat](https://paypal.me/Smile4ever/10).
````

## Description for the Chrome Web Store and Edge

Plain text only.

```text
Save the page you're on, or a link, to your Diigo library in a few keystrokes: press Alt+Shift+D, check the suggested tags, press Enter.

THIS ADD-ON IS NOT MADE BY DIIGO
It is an unofficial alternative to Diigo's own add-on, made for one thing: bookmarking, quickly and well. It uses your sign-in on diigo.com.

WHY I MADE IT
Diigo's own add-on does a lot more than bookmarking, but it didn't help me add bookmarks fast. I wanted to save a page in a few keystrokes, with my own tags suggested, and a library on diigo.com that's quicker to work with.

MADE FOR BOOKMARKS
• Tags that come to you: your own tags that appear in the title, the URL or the keywords of the page are suggested ("Machine Learning" suggests machine-learning), and so are the tags of your last bookmark on the same site. While you type, the tags you most often use together with them. An autocomplete and a cloud of your 100 most used tags for the rest.
• Less to fill in: a new bookmark gets the description of the page, a clean web address without tracking parameters, and what your rules for its site say (tags, private, read later).
• No bookmark twice: the form says when you saved the page before at nearly the same web address.
• You see what's saved: the toolbar icon shows whether the page is already in your library. The form then opens with your title, description and tags, and says when you saved it.
• Nothing gets lost: the form only closes once Diigo has saved the bookmark. If it can't, it says why and keeps what you typed.
• Save a link from the right-click menu, with the title of the page it points to.
• Title, URL, description, tags, Private and Read later, and share to a group or an outliner. Text you selected on the page becomes the description.
• Hidden tags: tags you don't want to see in suggestions, and whose bookmarks stay out of your library unless you search.

YOUR BROWSER BOOKMARKS TO DIIGO
• Choose folders on the options page and put their bookmarks in Diigo once, or keep them in sync: a new bookmark goes to Diigo a minute after you make it.
• Folder names become tags, and so do your own tags that the title or web address mentions, as the form suggests them. Bookmarks that are already in Diigo stay as they are.
• Only if you allow access to your bookmarks, on the options page.

SWIFT LIBRARY AND SWIFT DISCOVER
• Swift Library: your whole Diigo library as a page of the add-on, searched, sorted and filtered at once, also with thousands of bookmarks. Edit, Bulk edit, rename a tag, and a trash to put back what you deleted.
• Notes, images and PDFs too: add them as on diigo.com, read a note right there (code in colours), and edit it.
• Clean up on Start: similar tags to merge, bookmarks without a title to fetch it for, unread bookmarks older than 3 months, and links that moved or died.
• The status of each link (200, 404) before its title, also for all links at once. Click it to look up a dead page in the Wayback Machine or on archive.is, use its latest copy or its new web address, or search its title.
• Swift Discover: the Hot Bookmarks of the Diigo community, without what is in your library already, in the order For you (by your own tags), with a search box, filters by tag and site, and Not interested.
The add-on doesn't change diigo.com itself: it only adds the way there, Go to Swift Library in the menu at the top.

NOT IN THIS ADD-ON
Highlighting and sticky notes: for those there is Diigo's own add-on.

PRIVACY
The add-on sends nothing to its maker. It talks to diigo.com for you: while you're signed in it asks Diigo whether each page you open is in your library, and it sends Diigo the bookmarks you save. With the option for dead links on (the default), it requests the page of each bookmark in the Swift Library from its own site. Swift Discover loads the Hot Bookmarks from diigo.com. It only reads your browser bookmarks when you allow it on the options page, and only sends Diigo those of the folders you choose.

LANGUAGES
English, Dutch, German, French, Spanish, Italian, Brazilian Portuguese, Polish, Russian, Japanese and Simplified Chinese.

BUG REPORTS AND IDEAS
https://github.com/Smile4ever/Swift-Bookmarks-for-Diigo/issues
Find it useful? Buy the maker a treat: https://paypal.me/Smile4ever/10
```

## Privacy

### addons.mozilla.org

`manifest.json` declares `browsingActivity` (the URL of each page you open goes to Diigo, to show whether it's saved)
and `websiteContent` (the title, and the text you selected, go to Diigo in the bookmark you save) as required data
collection. AMO asks for a privacy policy when an add-on sends data; use the text below.

### Chrome Web Store and Edge: privacy practices

**Single purpose**

> Save the page you're on, or a link, as a bookmark in your Diigo library, and make your Diigo library and Diigo's Hot Bookmarks easier to use.

**Permission justifications**

| Permission | Justification |
|---|---|
| `alarms` | Checks the bookmark folders you chose to keep in sync every 6 hours, sends a new bookmark a minute after you make it, and goes on with a sync that was interrupted. |
| `bookmarks` (optional, asked for on the options page) | Reads the bookmarks of the folders you choose on the options page, to save them in your Diigo library. |
| `contextMenus` | The right-click menu items "Save page to Diigo" and "Save link to Diigo". |
| `cookies` | Reads the diigo.com sign-in cookie, to know who is signed in on diigo.com and to open the sign-in page when no one is. |
| `scripting` | Puts the bookmark form on the page when you click the toolbar button, press the shortcut or use the right-click menu. |
| `storage` | Keeps the options, the tags of your last bookmark, the bookmarks still to sync, and the Hot Bookmarks of Swift Discover with those you marked Not interested. |
| `tabs` | Reads the URL and title of the tab, for the bookmark and to show on the toolbar button whether the page is already saved. |
| Host permission `<all_urls>` | The form can be put on any page you want to bookmark; the add-on asks diigo.com whether a page is saved; it reads the title of a linked page for "Save link to Diigo"; and it checks whether the links in your library still work. |

**Remote code**: No, the add-on uses no remote code.

**Data usage** (tick these):

* Web history: the URLs of the pages you open go to Diigo, to show whether they are saved.
* Website content: the title, and the text you selected, go to Diigo in the bookmark you save.

And certify that the data is not sold, not used for anything else than the single purpose, and not used for credit.

### Privacy policy

```text
Swift Bookmarks for Diigo doesn't send any data to its maker, and has no server of its own.

It sends data to Diigo (diigo.com), the service it is made for, using your sign-in on diigo.com:
- while you're signed in, the URL of each page you open, to show on the toolbar button whether it is in your library;
- the bookmarks you save or delete: URL, title, description, tags, Private and Read later, and the group or outliner you share it to.
What Diigo does with that data is in Diigo's privacy policy: https://www.diigo.com/privacy

With the option "dead links" on (the default), the add-on requests the page of each bookmark in the Swift Library
from its own website, without cookies, to show whether it still exists. The status codes are kept in memory only.
With "Check links by themselves" off (Swift Options, Privacy), a link is only requested when you ask for it.
Fetch titles requests the pages you choose it for in the same way, for their title. Only when you choose Use the latest
copy in the Wayback Machine for a link, the add-on asks the Wayback Machine (archive.org) for that web address.

Swift Discover loads the Hot Bookmarks of the Diigo community from diigo.com (diigo.com/buzz/hot). What it loaded, for
an hour, and the bookmarks you marked Not interested are kept in your browser only.

Only when you allow access to your bookmarks on the options page, the add-on reads the bookmarks of your browser. It
sends Diigo those of the folders you choose (URL, title, and the folder names as tags), and those you save or move to
Diigo from the menu of a bookmark. Other bookmarks stay in your browser.

The tags of your last bookmark, the bookmarks still to sync and the URLs already synced are stored in your browser
only. The options are stored in your browser and, when your browser syncs add-on data, with your browser account
(Firefox Sync, Google or Microsoft), so your other computers get them too; they don't go to the maker of the add-on.
```
