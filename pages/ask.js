// A question before something is done, in the look of the popups of the add-on (ask.css) instead of the browser's
// confirm(): a card with the question and Cancel and OK. askConfirm(text, {danger}) gives a promise of true (OK) or
// false (Cancel, Esc, a click beside it). With danger (what can't be undone: deleting, a public link…) OK is red and
// Cancel has the focus, so Enter doesn't do it by accident. Over everything, also over a popup that is open (a modal
// dialog of its own, in the top layer). Used by the pages in pages/ and by the bookmark form (form/form.html).
function askConfirm(text, {danger = false} = {}) {
  const say = key => browser.i18n.getMessage(key);
  const dialog = document.createElement('dialog');
  dialog.className = 'ask';
  const card = document.createElement('form');
  card.method = 'dialog';
  card.className = 'ask-card' + (danger ? ' danger' : '');
  const question = document.createElement('p');
  question.className = 'ask-text';
  question.textContent = text;
  const buttons = document.createElement('div');
  buttons.className = 'ask-buttons';
  const cancel = document.createElement('button');
  cancel.className = 'ask-cancel';
  cancel.value = 'cancel';
  cancel.textContent = say('askCancel') || 'Cancel';
  const ok = document.createElement('button');
  ok.className = 'ask-ok';
  ok.value = 'ok';
  ok.textContent = say('askOk') || 'OK';
  buttons.append(cancel, ok);
  card.append(question, buttons);
  dialog.append(card);
  document.body.append(dialog);
  return new Promise(resolve => {
    // its keys stay in it: Esc closes only the question, not also the bookmark form or a popup under it, and the
    // shortcuts of the page don't work behind it (Enter, Space and Esc still do what they do in a dialog)
    dialog.addEventListener('keydown', e => e.stopPropagation());
    dialog.addEventListener('click', e => {
      if (e.target == dialog) dialog.close('cancel');
    });
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue == 'ok');
      dialog.remove();
    }, {once: true});
    dialog.showModal();
    (danger ? cancel : ok).focus();
  });
}
