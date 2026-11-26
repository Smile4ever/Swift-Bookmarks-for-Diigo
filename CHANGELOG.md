2026.11.26
=====
* Swift Discover opens on For you (by your tags) instead of Hot, so what matches your interests is at the top; the order can still be changed.
* Swift Discover shows the characters in titles, descriptions and tags, not HTML codes like &#039; for an apostrophe (Diigo sends them doubly coded).
* A Show hidden checkbox on diigo.com, at the bottom right of your own library when you have hidden tags: it shows the bookmarks with a hidden tag there for that tab, as Show hidden does in the Swift Library (hiding them on diigo.com left no way to see them there); off again in a new tab.
* Opening an image in the Swift Library shows it from its thumbnail at a large size instead of fetching the full file, and without the On Diigo link.
* Opening a PDF in the Swift Library opens its page on Diigo in a new tab (where your sign-in works), which then shows Loading PDF… until the tab opens the PDF itself (the blob Diigo's page loads it in, or else its original PDF) in the browser's own PDF viewer, instead of downloading it. A PDF the trash kept is shown inline. Download Original PDF on diigo.com itself still downloads.
* Deleting an image or a PDF in Diigo's delete window: the add-on gets its file for the trash only once you click DELETE, not already when you choose Delete. DELETE waits a moment for it, and the window can't be closed meanwhile.
* A click on the title of an image (in the list, on Start and in outliners) shows it in the Swift Library, also with Ctrl or the middle button.
* The trash and Recreate keep an image as its thumbnail at a large size, as the Swift Library shows it, not its original file.
* The trash and Recreate get the file of a PDF the way Diigo's own reader does: its page on Diigo opens for a moment in a tab in the background, and closes again by itself.
* Recreate in the ⋯ of an item now also works for images and PDFs: the item is uploaded again as a new one and the old one is deleted.
* Make public link in the ⋯ of an item: a link to the item that others can open, after a clear warning; for when you do want to share something.
* New public bookmarks are saved privately first and then made public (Swift Options, Privacy; on by default), as a privacy precaution. A switch in Swift Options turns it off.
* View the library offline, under Sign in in the Swift Library, for when diigo.com is down and the add-on takes you for signed out: your library as the add-on last kept it, with a note that changes don't reach Diigo; signed in again, the page goes on by itself. Clickable after 3 seconds, so a sign-in that comes in a moment isn't skipped.
* When diigo.com can't be reached (no connection, no answer, an error of its server), the Swift Library says so, instead of asking you to sign in.
* Swift Guide up to date: the ⋯ of an item, the picture at each bookmark and screenshots by choice, PDFs in the browser's own viewer, Show hidden on diigo.com, View the library offline, and public bookmarks saved private first; its pictures show the Swift Library as it is now.
* Fixed: the number next to Show hidden stayed the same when an item with a hidden tag left the list (Put back in the trash, Remove for good, Delete).
* Fixed: a tag chosen in All tags while Untagged was shown found nothing (untagged with a tag); it now shows All with that tag.
* Leaving the Swift Library while something you deleted waits its 30 seconds no longer asks to stay on the page: it stays in the trash as not deleted yet, and Diigo deletes it once the Swift Library is open again. Only changes to an outliner that aren't on Diigo yet still ask.
* The questions before something is done (Make public link, Delete, Empty trash, Recreate…) are a card in the look of the add-on instead of the browser's plain confirm box, with Cancel and OK; for what can't be undone, OK is red and Cancel has the focus, so Enter doesn't do it by accident.

2026.11.25
=====
* The Swift Library shows your bookmarks while it builds its index the first time, growing as the pages load, instead of a wait on the setting-up screen until it is all there. Building again over an index you already have is unchanged: that one stays until the new one is ready.
* The add buttons (Bookmark, Image, PDF, Note, Outliner) in the menu at the top of the Swift Library, before your name, in every view, instead of at the top of the side bar; without five buttons (Swift Options), the + with its menu is there.
* To diigo.com in the menu of your name, as its first item, leading to your library there; signed out, it stays next to where your name would be.
* More in the ⋯ of an item (in the list and on Start): Mark as unread or Mark as read (bookmarks and PDFs); Add to outliner, at the end of the outliner you choose (any kind of item); Share to group (a public bookmark, as the bookmark form shares one); Recreate, after a question: a bookmark or a note made again as a new one with all it has, and the old one deleted for good, with what only it had (highlights, its place in outliners).
* Empty trash no longer gets the files of images and PDFs that were still waiting to be deleted: they are deleted for good, so the trash has no use for them.
* Remove for good in Bulk edit of the trash also removes what Diigo hadn't deleted yet (Delete without asking): Diigo deletes it now, and the trash doesn't keep it; before, those were left out without a word, and with only those ticked nothing happened. While the Swift Library is busy (the index, deleting) it says so instead of doing nothing.
* Fixed: in the popups of the Swift Library (Edit, Add, Duplicate…) the browser's own list of what was typed before no longer covers the suggestions of your tags.
* Remove for good of one item in the trash asks first, as Remove for good of Bulk edit does.
* Show hidden tags in All tags of the Swift Library: your hidden tags in the cloud too, in italics and dashed underneath; off each time it opens, and only there when you have hidden tags.
* A note that is code (its title ends in .css, .py, .html…) also in colours in its first lines below its title, in the list and in Pinned on Start, as in its editor.
* Fixed: a popup with tags in the Swift Library (such as Edit) after an earlier one no longer fails with "list is null": the suggestions below the tags had gone with the earlier popup.

2026.11.23
=====
* A small picture at each bookmark in the Swift Library: the preview image of its page, as social sites show a link (og:image), or its icon when it has none; read from the page once, together with the check of its link, and kept in this browser for a month, so it costs no room in Diigo. A screenshot goes before it; a click opens the page. Without a picture, the room of one with the first letter of its site, so each item starts at the same place. A switch in Swift Options, on by default.
* A screenshot keeps the tags of its bookmark: changed in the add-on (the bookmark form, Edit, the ⋯ of an item, Done, Unpin, Bulk edit), its screenshots get them too, so a hidden tag added later hides them as well; a new web address goes along in their description.
* The description of a screenshot has the title and web address of its page.
* Also save a screenshot in Edit of the Swift Library too: the page opens in a tab for a moment for it.
* A screenshot waits until its page is loaded in full: what it still asks over the network after loading, what it draws then (fonts, images in view, content its scripts add), at most 15 seconds for a page opened for it and 5 seconds for the page you're on.
* Also save a screenshot is no longer remembered: off each time, in the bookmark form and in Edit, so each screenshot is one you choose. Diigo keeps only a limited number of images (a free account only a few dozen), not enough for one of every bookmark.
* Delete screenshot in the ⋯ of a bookmark that has one (in the list and on Start): its screenshot to the trash, as Delete does it; the bookmark stays, without the link to the screenshot in its description. So does Delete of a screenshot itself.
* A warning before a screenshot of a page of a bookmark with a hidden tag, in the bookmark form and in Edit.
* Screenshots out of the Swift Library by default, as with a hidden tag (Show hidden or a search for screenshot shows them), and as a small picture at their bookmark instead; both a switch in Swift Options.
* No picture at an item with a hidden tag, when Show hidden or a search shows it: no screenshot, preview image or image of its own, only its room; nothing is read from its page either. A switch in Swift Options, on by default.
* Hidden tags hidden on diigo.com too: in your library there, no bookmarks with a hidden tag and no hidden tags in the list of tags, unless you search for such a tag; else anyone looking at your screen would see them there. A switch in Swift Options (Hidden tags), on by default.
* A bar of how far while Diigo deletes what waited in the trash (Delete without asking), and while the trash is emptied: with many items that takes a while, and nothing showed it.
* Random without bookmarks: Random all the same, with No bookmarks yet, instead of 0 items as an error (in the side bar) or Start (Random bookmark of the toolbar button). Random bookmark while the index still loads shows them once it has.
* Shortcuts in Swift Guide instead of Swift Options, now also those of the Swift Library (Ctrl+F, Ctrl+Enter, Bulk edit) and of outliners.
* Search in the text of notes too: in all fields, or only there with the new field Text of a note; a rich note as you read it, without its HTML.
* The options of the Swift Library in Swift Options in three groups: the list and Start, screenshots, Bulk edit and Delete. The preview pictures of pages, and none at an item with a hidden tag, are under Privacy.
* The links of bookmarks with a hidden tag are no longer checked by themselves (shown with Show hidden, or by Check all links): their sites get no request for them unless you click their ·. A switch in Swift Options, Privacy, off by default.
* Swift Guide tells more about tags and outliners: All tags, renaming a tag, Similar tags, and writing in an outliner, with pictures of each.
* Rules per site (tags, private and read later for a new bookmark of a site) are gone from Swift Options and the bookmark form; rules made before are forgotten once the add-on is updated.
* Update and Build again of the index in a card of their own near the end of Swift Options, Index, instead of at the top: the index keeps itself up to date.
* Tags suggested in Edit and Add of the Swift Library too, as in the bookmark form: Suggested (your tags in the title, and those of the last bookmark on the same site), Often with these, your tags as you type, and the tag icon in the field with your 100 most used tags; for bookmarks, notes, images and PDFs.
* No more Manage tags next to the cloud of your tags in the bookmark form: it led to diigo.com. Renaming and merging tags is in the Swift Library.

2026.11.22
=====
* Empty trash also clears the filters of the trash (tags, site, search).
* The trash no longer says it is empty while it has items that Diigo hasn't deleted yet; its count and size are of all it has, also what has a hidden tag.
* The menu of the status of a link has the same archives for every link, working or not: Use the latest copy in the Wayback Machine too.
* Clean up on Start no longer has All to the new address: Moved shows the list of them with the new web address under each, and Bulk edit has Use the new web address for those you tick.
* Start is yours: Customize Start moves its blocks, leaves them out or shows them again, and adds blocks of your own, what a search finds (newest, oldest, last changed or at random, as many as you choose); kept with your settings. A new block, Pinned, at the top: what has the tag pinned, with Unpin; a note with its text, and with a long one the block as wide as Start; in a warm tint with a pin, and More as a button.
* The bookmark form on a page you saved at nearly the same web address (http or https, www., tracking parameters…) opens that bookmark to edit instead of a new one with a link to it; one Diigo doesn't find at its web address opens as the index has it. The toolbar icon shows such a page as saved too. Saved again, such a bookmark is changed by its link_id, as Diigo's own edit window does it, instead of Diigo making a new one beside it.
* The bookmark form can save a screenshot of the page along (Also save a screenshot, remembered): an image in your library, private, tagged screenshot, with a link to it in the description of the bookmark.
* Recently changed on Start: what was changed after it was saved (its title, web address, tags…), the last changed first.
* The ⋯ of an item (in the list and on Start): Pin to Start or Unpin, Hide or Show again, without typing the tag.
* A block of your own on Start shows bookmarks with a hidden tag too when its search names that tag in full, as the list does.
* A bookmark given its new web address (or the Wayback copy, or Not dead) stays in the list it was changed in, also in the filter of moved links.
* Swift Discover loads more pages of Diigo till 500 are shown (not more than 10 pages at once), instead of 3 pages, which often left about 200.
* ?swift=false after the address of your library on diigo.com: Diigo's own for the rest of that tab on diigo.com.
* To do on Start: bookmarks with a tag that starts with todo (todo, todo-work…), the oldest first, each with Done, which takes those tags away; More shows them all. In Swift Options they can be some at random instead, with Others.
* Dead links gives the choice for the links not checked yet: Check all links, or Find the first 10 dead links, which checks them in a random order until 10 dead ones are found, each added at the end of the list at once without drawing it again, with Stop; instead of showing 20 at random and checking those. Check all links adds what it finds to Dead links in the same way. Both show how far in the bar of Dead links, with a progress bar and Stop, and the status bar keeps saying it till they are done.
* Show hidden has a count after it: how many bookmarks with a hidden tag match what is shown, so you know when some are left out (a dead link found with a hidden tag, say).
* Start can be chosen again with a search typed or a filter chosen: it empties them (Back in the browser brings them back), instead of staying in the list.
* Dead links, Duplicates and Without a title start without the filters of the library (tags, site, search, private or public, when saved), as the trash does; going back, those filters return.
* The message of how many items were removed from the trash closes when you leave the trash.
* The index is kept when Diigo doesn't load or gives no items, instead of being emptied; and when it gives far fewer items than before (less than half), unless you say yes to replacing it, after Build again. What the index had and Diigo no longer gives (deleted in Diigo's app or another browser, or lost by Diigo) goes to the trash when the index is built again, marked No longer on Diigo, to put back for 30 days.
* Editing an item (its title, URL…) redraws only that item, not the whole list; also when the index is brought up to date after it.
* Bulk edit in the trash: tick items (also with Shift+click and Shift+arrows) to Put back or Remove for good; Delete removes the ticked ones for good, after a question.
* Swift Guide: what the add-on does more than Diigo, with pictures, among which hiding bookmarks with the tag hidden. It opens once when the add-on is installed, and from then on from the menu at the top of the Swift pages, the menu of the toolbar button and Swift Options. After the update, a bar in the Swift Library says once that it's there.
* Swift Guide has a section on the kinds of items (bookmarks, notes, images and PDFs, Kindle, annotated) and what the add-on does with each, and one on the bookmarks of the browser to Diigo: what goes, and that it goes one way only.
* diigo.com as little changed as can be: Diigo's own menu items (My Library, My Outliners, My Groups, Tools, Go Premium) stay as Diigo has them, no longer hidden or moved, and the add-on adds one button after them, Go to Swift Library, in place of its own items (Swift Library, Swift Discover, Swift Options, Learn more); the menu at the top of diigo.com is no longer set on the options page, and links of your own there are gone. Your library on diigo.com opens the Swift Library (as before, a switch in Swift Options), now however you go there (My Library, a link, a bookmark), but with ?swift=false after its address. My Library in the menu at the top of diigo.com (and groups.diigo.com) is never taken over: it leads to Diigo's own, with ?swift=false. Tools opens Diigo's own page by default, Swift Tools as a choice. The Swift Library after signing in stays. The menu at the top of the Swift pages always has all of them.
* Swift Options: what the toolbar button opens, the bookmark form (as before) or always the Swift Library; the shortcut stays the bookmark form.
* The Swift Library already open in the window: the toolbar button and its menu go to that tab instead of opening another.
* On a page that can't be bookmarked (browser pages, the add-on stores, local files) the toolbar button and its shortcut open the Swift Library, with books on the icon, instead of a grey button that does nothing.
* The pages of the add-on show its own icon at the top left, leading to the Swift Library, instead of Diigo's logo: they are not Diigo's pages, and the logo no longer has to be loaded from diigo.com. To diigo.com, at the right of their menu, leads back to your library there.
* The menu of your name on the Swift pages says it is your account on diigo.com, with ↗ after each item: Public Library, Settings on Diigo and Sign Out; Diigo's Help and Support and Discover are no longer in it.
* The Swift pages are more in the language of the browser: their menu at the top (Library, Discover, Options, Tools, Guide, without Swift, and Diigo's own items), the menu of your name, and the side bar of the Swift Library (All, Bookmarks, Notes…, Tags, All tags); the menu of the toolbar button too (Library, Discover, Guide); on diigo.com they keep their full names.
* Tools is now Swift Tools in the menus of the Swift pages, and no longer has the Diigo API, which is for Premium only; Save by Email is there under Save.
* Privacy in Swift Options: Check links by themselves can be turned off; links are then only checked when you ask for it (a click on its ·, Check all links). Hidden tags are no longer folded away there.
* The settings are kept with the account of your browser (storage.sync), so your other computers get them too, and Swift Options follows a change from another computer while it is open; the folders to sync stay on each computer. Links you said are not dead, similar tags you said are not the same and Not interested in Swift Discover go along too, while they fit. In Firefox, Swift Options says this needs Add-ons ticked in Firefox Sync.

2026.11.21
=====
First version of Swift Bookmarks for Diigo, for Firefox (140 or newer, also on Android), Chrome and Edge (121 or newer). It is not made by Diigo: an unofficial alternative to Diigo's own add-on, made for bookmarking, using your sign-in on diigo.com. See the README for how it works.

The bookmark form
* On the page, from the toolbar button, Ctrl+Alt+D (Alt+Shift+D in Chrome and Edge) or the right-click menu (Save page, Save link).
* Title, URL, description, tags, Private and Read later, Share to group and Share to outliner.
* The toolbar icon shows whether the page is in your library; the form then opens with what you saved, and when.
* Suggested tags: your own tags in the title, the URL or the keywords of the page, those of your last bookmark on the same site, and Often with these. An autocomplete and a cloud of your 100 most used tags.
* A new bookmark gets the description of the page, is saved without tracking parameters and at the address the page calls its own, and gets what your rules for its site say.
* The form says when you saved the page before at nearly the same address.
* Hidden tags: not suggested, and their bookmarks kept out of the Swift Library unless you search for them.

The Swift Library
* Your whole Diigo library as a page of the add-on, from a copy in the browser: search, sort and filter at once, also with thousands of bookmarks.
* Add, Edit and Bulk edit for bookmarks, notes, images and PDFs; notes and images shown in the page, notes that are code in colours.
* Start: recently saved and shared, to read, random, on this day, the trash, and Clean up: similar tags to merge, duplicates, untagged, without a title, unread for over 3 months, dead and moved links.
* The status of each link before its title (200, 404, BOT, PARKED, →…), with the Wayback Machine, archive.is, the latest copy or the new web address, and Check all links.
* Rename a tag, and a trash to put back what you deleted, here or on diigo.com, for 30 days.
* Your outliners of Diigo: Outliners in the side bar, with their first lines, and one as a tree to write in with the keyboard, with items from your library. Deleted ones go to the trash too.
* Opens instead of your library on diigo.com when you sign in there, and the menu of your name as on diigo.com.

Swift Discover and Tools
* Swift Discover: the Hot Bookmarks of the Diigo community without what you have already, in the order For you, with a search box, filters, Save and Not interested.
* Tools: Diigo's Tools page as a page of the add-on.

And more
* Your bookmarks in the address bar: d, a space and words.
* The bookmarks of folders of the browser to Diigo, once or kept in sync, with the folder names as tags and the tags the form would suggest; in Firefox also Save to Diigo and Move to Diigo in the menu of a bookmark.
* Swift Options, with a box to find an option, and a log of what went wrong, to save for a bug report.
* On diigo.com only the way to these pages, in the menu at the top as you set it.

In English, Dutch, German, French, Spanish, Italian, Brazilian Portuguese, Polish, Russian, Japanese and Simplified Chinese.
