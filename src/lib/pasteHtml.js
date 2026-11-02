// Fixes for HTML pasted from Google Docs (and similar editors) that Quill would otherwise lose.
// Runs on the parsed clipboard document before Quill converts it.

const HEADINGS = 'h1, h2, h3, h4, h5, h6';

function toAlpha(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(97 + ((n - 1) % 26)) + s;
  return s;
}

function toRoman(n) {
  const map = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let s = '';
  for (const [value, numeral] of map) for (; n >= value; n -= value) s += numeral;
  return s;
}

// The marker the list showed for item `n`, e.g. "3.", "c.", "iv.".
function listMarker(li, list, n) {
  const type = li.style.listStyleType || list.style.listStyleType || list.getAttribute('type') || '';
  if (list.tagName !== 'OL') return '';
  if (/lower-alpha|lower-latin|^a$/.test(type)) return `${toAlpha(n)}.`;
  if (/upper-alpha|upper-latin|^A$/.test(type)) return `${toAlpha(n).toUpperCase()}.`;
  if (/lower-roman|^i$/.test(type)) return `${toRoman(n)}.`;
  if (/upper-roman|^I$/.test(type)) return `${toRoman(n).toUpperCase()}.`;
  return `${n}.`;
}

const level = (li) => Number(li.getAttribute('aria-level')) || 1;

// Numbered headings ("1. Cervical: neck") are a heading inside a list item. A Quill line can be a
// heading or a list item, not both, so the heading is moved out of the list with its number
// written in front of it.
function liftListHeadings(doc) {
  const items = [...doc.querySelectorAll('li')].filter((li) => li.querySelector(HEADINGS));
  // Work out every number first: lifting a heading splits its list.
  const numbered = items.map((li) => {
    const list = li.parentElement;
    const siblings = [...list.children].filter((el) => el.tagName === 'LI' && level(el) === level(li));
    const start = Number(list.getAttribute('start')) || 1;
    return { li, marker: listMarker(li, list, start + siblings.indexOf(li)) };
  });
  numbered.forEach(({ li, marker }) => {
    const heading = li.querySelector(HEADINGS);
    if (marker) (heading.firstElementChild || heading).prepend(`${marker} `);
    const list = li.parentElement;
    const rest = list.cloneNode(false);
    while (li.nextSibling) rest.appendChild(li.nextSibling);
    list.after(heading);
    if (rest.children.length) heading.after(rest);
    li.remove();
    if (!list.children.length) list.remove();
  });
}

// Google Docs marks nested items with aria-level instead of nesting the lists. Quill reads the
// nesting depth, so wrap each deeper item in extra lists of the same kind.
function nestByAriaLevel(doc) {
  doc.querySelectorAll('li[aria-level]').forEach((li) => {
    const depth = level(li) - 1;
    if (depth <= 0 || li.parentElement.closest('li')) return;
    let outer = li;
    for (let i = 0; i < depth; i += 1) {
      const wrapper = doc.createElement(li.parentElement.tagName);
      outer.replaceWith(wrapper);
      wrapper.appendChild(outer);
      outer = wrapper;
    }
  });
}

// Font sizes the editor offers (the size dropdown). Pasted sizes snap to the nearest one.
// Article text is 18px by default (the site's .article-content), so 18px is "no size set" and
// isn't stored.
export const DEFAULT_FONT_SIZE = '18px';
export const FONT_SIZES = ['12px', '14px', '16px', '20px', '24px', '28px', '32px', '40px'];

function toPx(value) {
  const match = /^([\d.]+)(px|pt)$/.exec(value.trim());
  if (!match) return null;
  return match[2] === 'pt' ? Number(match[1]) * (4 / 3) : Number(match[1]);
}

// Pasted text keeps its font size, except the document's normal body size, which becomes the
// site's normal size (otherwise every article would be 11pt Google Docs text). Headings and list
// markers keep the site's sizes.
function keepFontSizes(doc) {
  const sized = [...doc.body.querySelectorAll('[style*="font-size"]')];
  const textBySize = new Map();
  sized.forEach((el) => {
    const px = toPx(el.style.fontSize);
    if (px && el.tagName !== 'LI' && !el.closest('h1, h2, h3, h4, h5, h6')) {
      textBySize.set(px, (textBySize.get(px) || 0) + el.textContent.length);
    }
  });
  const bodySize = [...textBySize].sort((a, b) => b[1] - a[1])[0]?.[0];
  sized.forEach((el) => {
    const px = toPx(el.style.fontSize);
    if (!px || px === bodySize || el.tagName === 'LI' || el.closest('h1, h2, h3, h4, h5, h6')) {
      el.style.removeProperty('font-size');
      return;
    }
    const nearest = [DEFAULT_FONT_SIZE, ...FONT_SIZES].reduce((best, size) =>
      Math.abs(parseFloat(size) - px) < Math.abs(parseFloat(best) - px) ? size : best);
    if (nearest === DEFAULT_FONT_SIZE) el.style.removeProperty('font-size');
    else el.style.fontSize = nearest;
  });
}

export function normalizePastedHtml(doc) {
  liftListHeadings(doc);
  nestByAriaLevel(doc);
  keepFontSizes(doc);
}
