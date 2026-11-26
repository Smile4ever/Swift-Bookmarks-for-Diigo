// A part of the Swift Library (library.html); library.js has what they share, library-page.js puts them to work.

// ---- code in a note: in colours, by the extension at the end of its title ----

// A note whose title ends in .py, .cs, .css, .html… is code (codeLanguage): its editor (codeEditor, for editNote and
// addNote in library-edit.js and library-add.js) is a text field with the code in colours behind it, the colours of
// its language (highlight). Each language is a list of rules, [kind, regular expression], tried in their order at each
// place of the text; what none of them takes stays as it is. Made for reading, not a parser: a rare piece of code can
// get a wrong colour.

const CODE_EXTENSIONS = {
  py: 'python', pyw: 'python',
  cs: 'csharp', java: 'java', kt: 'java', scala: 'java', swift: 'swift', go: 'go', rs: 'rust',
  c: 'c', h: 'c', cpp: 'c', cc: 'c', cxx: 'c', hpp: 'c', m: 'c',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'javascript', tsx: 'javascript',
  json: 'json',
  css: 'css', scss: 'css', less: 'css',
  html: 'markup', htm: 'markup', xhtml: 'markup', xml: 'markup', svg: 'markup', vue: 'markup',
  php: 'php', rb: 'ruby', sh: 'shell', bash: 'shell', zsh: 'shell', ps1: 'powershell', sql: 'sql',
  yml: 'yaml', yaml: 'yaml', ini: 'ini', toml: 'ini',
};

// the language of a note, by the end of its title ("styles.css", "Script.PY"), or '' when it is no code
function codeLanguage(title) {
  const extension = /\.([a-z0-9]+)\s*$/i.exec(title || '')?.[1].toLowerCase();
  return CODE_EXTENSIONS[extension] || '';
}

const keywordsOf = list => `\\b(?:${list.split(' ').join('|')})\\b`;
// the end of the text, also with the flag m, where $ is the end of a line: a comment not closed yet runs to there
const END = String.raw`(?![\s\S])`;

const CODE = {
  lineComment: String.raw`\/\/[^\n]*`,
  blockComment: String.raw`\/\*[\s\S]*?(?:\*\/|${END})`,
  hashComment: String.raw`#[^\n]*`,
  doubleString: String.raw`"(?:\\[\s\S]|[^"\\\n])*"?`,
  singleString: String.raw`'(?:\\[\s\S]|[^'\\\n])*'?`,
  number: String.raw`(?<![\w$])(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)[a-zA-Z]*`,
  call: String.raw`\b[A-Za-z_$][\w$]*(?=\s*\()`,
};

// the languages like C: // and /* */, strings between " and ', keywords, numbers, and what is called (a function)
const cLike = (keywords, ...extra) => [
  ['comment', CODE.lineComment], ['comment', CODE.blockComment], ...extra,
  ['string', CODE.doubleString], ['string', CODE.singleString],
  ['keyword', keywordsOf(keywords)], ['number', CODE.number], ['function', CODE.call],
];

const LANGUAGES = {
  python: [
    ['comment', CODE.hashComment],
    ['string', String.raw`(?<!\w)[rRbBuUfF]{0,2}(?:"""[\s\S]*?(?:"""|${END})|'''[\s\S]*?(?:'''|${END})|"(?:\\[\s\S]|[^"\\\n])*"?|'(?:\\[\s\S]|[^'\\\n])*'?)`],
    ['attr', String.raw`@[\w.]+`],
    ['keyword', keywordsOf('and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return self True try while with yield match case')],
    ['number', CODE.number], ['function', CODE.call],
  ],
  csharp: cLike('abstract as async await base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach get goto if implicit in init int interface internal is lock long namespace new null object operator out override params private protected public readonly record ref return sbyte sealed set short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile when where while yield',
    ['string', String.raw`[$@]{1,2}"(?:""|\\[\s\S]|[^"])*"?`], ['attr', String.raw`^\s*#\w+`]),
  java: cLike('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for fun goto if implements import instanceof int interface long native new null package private protected public return short static super switch synchronized this throw throws transient true false try val var void volatile when while object',
    ['attr', String.raw`@\w+`]),
  swift: cLike('as break case catch class continue default defer do else enum extension false fileprivate for func guard if import in init inout internal is let nil open operator private protocol public repeat return self static struct subscript super switch throw throws true try var where while',
    ['attr', String.raw`@\w+`]),
  go: cLike('break case chan const continue default defer else fallthrough false for func go goto if import interface iota map nil package range return select struct switch true type var',
    ['string', '`[^`]*`?']),
  rust: cLike('as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while',
    ['attr', String.raw`#!?\[[^\]\n]*\]?`]),
  c: cLike('auto bool break case catch char class const constexpr continue default delete do double else enum explicit extern false float for friend goto if inline int long namespace new nullptr operator private protected public register return short signed sizeof static struct switch template this throw true try typedef typename union unsigned using virtual void volatile while',
    ['attr', String.raw`^\s*#\s*\w+[^\n]*`]),
  javascript: cLike('as async await break case catch class const continue debugger default delete do else enum export extends false finally for from function get if implements import in instanceof interface let new null of package private protected public return set static super switch this throw true try type typeof undefined var void while with yield',
    ['string', '`(?:\\\\[\\s\\S]|[^`\\\\])*`?'], ['string', String.raw`\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n])+\/[dgimsuvy]*(?=\s*[.,;)\]}]|\s*$)`]),
  json: [
    ['property', String.raw`"(?:\\[\s\S]|[^"\\\n])*"(?=\s*:)`], ['string', CODE.doubleString],
    ['keyword', keywordsOf('true false null')], ['number', String.raw`-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?`],
  ],
  css: [
    ['comment', CODE.blockComment], ['comment', String.raw`(?<![:\w])\/\/[^\n]*`],
    ['string', CODE.doubleString], ['string', CODE.singleString],
    ['keyword', String.raw`@[\w-]+|!important\b`], ['punct', '[{}]'],
    ['property', String.raw`--[\w-]+|-?[A-Za-z][\w-]*(?=\s*:(?!:))`],
    ['number', String.raw`#[\da-fA-F]{3,8}\b|(?<![\w-])-?\d*\.?\d+(?:[a-zA-Z]+|%)?`],
    ['function', String.raw`\b[\w-]+(?=\()`],
  ],
  php: cLike('abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends false final finally fn for foreach function global goto if implements include instanceof insteadof interface isset list match namespace new null or print private protected public readonly require return static switch throw trait true try unset use var while yield',
    ['comment', CODE.hashComment], ['attr', String.raw`\$[A-Za-z_]\w*`], ['keyword', String.raw`<\?php|\?>`]),
  ruby: [
    ['comment', CODE.hashComment], ['string', CODE.doubleString], ['string', CODE.singleString],
    ['attr', String.raw`:[A-Za-z_]\w*|@{1,2}\w+`],
    ['keyword', keywordsOf('alias and begin break case class def defined do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield require attr_accessor attr_reader')],
    ['number', CODE.number], ['function', CODE.call],
  ],
  shell: [
    ['comment', String.raw`(?<![\w$])#[^\n]*`], ['string', CODE.doubleString], ['string', CODE.singleString],
    ['attr', String.raw`\$\{[^}\n]*\}?|\$[\w@#?$!*-]`],
    ['keyword', keywordsOf('if then else elif fi for while until do done case esac in function return local export readonly declare unset shift break continue exit echo source alias')],
    ['number', CODE.number],
  ],
  powershell: [
    ['comment', String.raw`<#[\s\S]*?(?:#>|${END})`], ['comment', CODE.hashComment],
    ['string', CODE.doubleString], ['string', CODE.singleString], ['attr', String.raw`\$[\w:]+`],
    ['keyword', String.raw`\b(?:begin|break|catch|class|continue|data|do|dynamicparam|else|elseif|end|exit|filter|finally|for|foreach|from|function|if|in|param|process|return|switch|throw|trap|try|until|using|while)\b|-(?:eq|ne|gt|ge|lt|le|like|notlike|match|notmatch|contains|notcontains|and|or|not)\b`],
    ['function', String.raw`\b[A-Z][a-z]+-[A-Z]\w*`], ['number', CODE.number],
  ],
  sql: [
    ['comment', String.raw`--[^\n]*`], ['comment', CODE.blockComment], ['string', CODE.singleString],
    ['property', String.raw`"(?:""|[^"])*"?|\x60[^\x60]*\x60?|\[[^\]\n]*\]`],
    ['keyword', keywordsOf('add all alter and any as asc between by case check column constraint create database default delete desc distinct drop else end exists foreign from full group having in index inner insert into is join key left like limit not null offset on or order outer primary references right select set table then top union unique update values view when where with')],
    ['number', CODE.number], ['function', CODE.call],
  ],
  yaml: [
    ['comment', String.raw`(?<!\S)#[^\n]*`], ['property', String.raw`^\s*-?\s*[\w.-]+(?=\s*:(?:\s|$))`],
    ['string', CODE.doubleString], ['string', CODE.singleString],
    ['keyword', keywordsOf('true false null yes no on off')], ['number', CODE.number],
  ],
  ini: [
    ['comment', String.raw`^\s*[;#][^\n]*`], ['keyword', String.raw`^\s*\[[^\]\n]*\]?`],
    ['property', String.raw`^\s*[\w.-]+(?=\s*[=:])`], ['string', CODE.doubleString], ['string', CODE.singleString],
    ['keyword', keywordsOf('true false')], ['number', CODE.number],
  ],
};

// a rule, case-insensitive for SQL (SELECT and select)
const compiled = new Map();
function grammar(language) {
  if (!compiled.has(language)) {
    const rules = LANGUAGES[language];
    const source = rules.map(([, re]) => `(${re})`).join('|');
    compiled.set(language, {kinds: rules.map(([kind]) => kind), re: new RegExp(source, language == 'sql' ? 'gmi' : 'gm')});
  }
  return compiled.get(language);
}

// what a piece of text becomes: a text node, or a span with the class of its kind
function piece(kind, text) {
  if (!kind) return document.createTextNode(text);
  const span = document.createElement('span');
  span.className = 'tok-' + kind;
  span.textContent = text;
  return span;
}

// text in the colours of language, appended to out. CSS: outside { } a word is a selector, not a property.
function paint(text, language, out) {
  if (language == 'markup') return paintMarkup(text, out);
  const {kinds, re} = grammar(language);
  let at = 0, depth = 0;
  const plain = until => {
    if (until > at) out.append(piece(language == 'css' && depth == 0 ? 'selector' : '', text.slice(at, until)));
  };
  re.lastIndex = 0;
  for (let match; (match = re.exec(text));) {
    if (!match[0]) {
      re.lastIndex++;
      continue;
    }
    plain(match.index);
    let kind = kinds[match.slice(1).findIndex(group => group !== undefined)];
    if (language == 'css') {
      if (match[0] == '{') depth++;
      if (match[0] == '}') depth = Math.max(0, depth - 1);
      if (depth == 0 && ['property', 'number', 'function'].includes(kind)) kind = 'selector';
    }
    out.append(piece(kind == 'punct' ? '' : kind, match[0]));
    at = match.index + match[0].length;
  }
  plain(text.length);
}

// HTML and XML: comments, <!DOCTYPE>, tags with their attributes, entities; what is in <style> as CSS, in <script> as
// JavaScript
function paintMarkup(text, out) {
  const re = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>?|<\?[\s\S]*?(?:\?>|$)|<\/?[A-Za-z][\w:.-]*(?:"[^"]*"?|'[^']*'?|[^>"'])*>?|&#?\w+;/g;
  let at = 0;
  for (let match; (match = re.exec(text));) {
    if (match.index > at) out.append(text.slice(at, match.index));
    const token = match[0];
    at = match.index + token.length;
    if (token.startsWith('<!--') || token.startsWith('<![CDATA[')) {
      out.append(piece('comment', token));
    } else if (token.startsWith('<!') || token.startsWith('<?')) {
      out.append(piece('keyword', token));
    } else if (token.startsWith('&')) {
      out.append(piece('number', token));
    } else {
      paintTag(token, out);
      // the inside of <style> and <script>, up to where it is closed
      const inner = /^<(style|script)\b/i.exec(token)?.[1].toLowerCase();
      if (inner && !token.endsWith('/>')) {
        const end = text.slice(at).search(new RegExp(`</${inner}\\s*>`, 'i'));
        const stop = end < 0 ? text.length : at + end;
        paint(text.slice(at, stop), inner == 'style' ? 'css' : 'javascript', out);
        at = re.lastIndex = stop;
      }
    }
  }
  if (at < text.length) out.append(text.slice(at));
}

// <a href="…" hidden>: its name a tag, each attribute and its value
function paintTag(tag, out) {
  const name = /^<\/?[\w:.-]+/.exec(tag)[0];
  out.append(piece('tag', name));
  const re = /([^\s=>/"']+)|("[^"]*"?|'[^']*'?)|(\/?>)/g;
  let at = name.length;
  re.lastIndex = at;
  for (let match; (match = re.exec(tag));) {
    if (match.index > at) out.append(tag.slice(at, match.index));
    out.append(piece(match[1] ? 'attr' : match[2] ? 'string' : 'tag', match[0]));
    at = match.index + match[0].length;
  }
  if (at < tag.length) out.append(tag.slice(at));
}

// text in the colours of language, as a DocumentFragment
function highlight(text, language) {
  const out = document.createDocumentFragment();
  if (LANGUAGES[language] || language == 'markup') paint(text, language, out);
  else out.append(text);
  return out;
}

// The text of a rich note (HTML) as code: what the note shows, a line for each paragraph or <br>; an empty paragraph
// (<p><br></p>, as editors write it) one empty line
function noteCode(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  const BLOCKS = 'p, div, li, pre, h1, h2, h3, h4, h5, h6, tr, blockquote';
  for (const br of doc.body.querySelectorAll('br')) {
    const parent = br.parentElement;
    if (parent?.matches(BLOCKS) && parent.childNodes.length == 1) br.remove();
    else br.replaceWith('\n');
  }
  for (const block of doc.body.querySelectorAll(BLOCKS)) block.append('\n');
  return doc.body.textContent.replace(/\n$/, '');
}

// code as a rich note keeps it: in a <pre>, so Diigo shows it as it is, in a font for code
function codeNote(code) {
  const pre = document.createElement('pre');
  pre.textContent = code;
  return pre.outerHTML;
}

// The editor of a note that is code: a text field (content, so its value is the code) with the code in colours behind
// it, drawn again as you type, and scrolled along. Tab puts in a tab, as in an editor of code; Shift+Tab goes on to the
// next field. setLanguage: other colours, when the title of a new note changes.
function codeEditor(code, language) {
  const editor = element('div', 'code-editor');
  const view = element('pre', 'code-view');
  view.setAttribute('aria-hidden', 'true');
  const content = Object.assign(element('textarea', 'note-plain code-text'), {rows: 14, value: code || '', spellcheck: false});
  content.wrap = 'off';
  content.setAttribute('autocapitalize', 'off');
  let frame = 0;
  const draw = () => {
    frame = 0;
    // a last empty line has the height of a line too
    view.replaceChildren(highlight(content.value, language), '\n');
    view.scrollTop = content.scrollTop;
    view.scrollLeft = content.scrollLeft;
  };
  content.addEventListener('input', () => frame ||= requestAnimationFrame(draw));
  content.addEventListener('scroll', () => {
    view.scrollTop = content.scrollTop;
    view.scrollLeft = content.scrollLeft;
  });
  content.addEventListener('keydown', e => {
    if (e.key != 'Tab' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    e.preventDefault();
    content.setRangeText('\t', content.selectionStart, content.selectionEnd, 'end');
    content.dispatchEvent(new Event('input'));
  });
  editor.dataset.language = language;
  editor.append(view, content);
  draw();
  const setLanguage = other => {
    language = other;
    editor.dataset.language = other;
    draw();
  };
  return {editor, content, setLanguage};
}
