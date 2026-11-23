# Bugs in diigo.com

Only what Diigo does wrong that the add-on works around today, one line each, with where. How diigo.com works is in
[diigo-com.md](diigo-com.md). Seen in November 2026.

* **Bulk tags fail**: `/ditem_mana2/batch_edit_tags` answers 500, even for one tag on one bookmark. Bulk edit saves
  each item on its own then (`options/library-index.js`: `bulkRequests`).
* **A public image can't be uploaded**: `/item/save/image` with `private=false` answers 500. Uploaded private, made
  public after (`options/library-index.js`: `addFile`).
* **The total lags behind**: just after a save, Diigo lists the new item but doesn't count it yet. Another number than
  the index is asked again after a while before the index is built again (`options/library.js`: `checkCount`).
* **Your own outliner reads as shared to read**: `GET /outliner/<id>` gives `permission: ["read"]` for your own ones
  too. One in your `/list` is taken as yours to change (`options/library-outliners.js`: `loadOutliner`).
* **Upon creating an account, there are dead links** A new account contains a link to "Getting Started with Chrome extension" and "Getting Started with Diigolet" which are both dead links.
