import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { ArrowDown, ArrowLeft, ArrowUp, CalendarClock, CalendarX, Eye, Globe, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { slugify, unwrap, uploadImage, publicPath, NEWS_CATEGORY, PUBLIC_SITE_URL } from '@/lib/helpers';
import { Select } from '@/components/ui/select';
import { fetchAuthors } from '@/pages/AdminAuthors';
import ScheduleDialog from '@/components/ScheduleDialog';
import { normalizePastedHtml, FONT_SIZES } from '@/lib/pasteHtml';
import ConfirmDialog from '@/components/ConfirmDialog';

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Links typed without a protocol (e.g. "example.com") would otherwise be saved as relative
// URLs and break on the live site, so treat them as https.
const QuillLink = Quill.import('formats/link');
class ExternalLink extends QuillLink {
  static sanitize(url) {
    const value = super.sanitize(url.trim());
    if (/^([a-z][a-z0-9+.-]*:|\/|#|\?)/i.test(value)) return value;
    return `https://${value}`;
  }
}
Quill.register(ExternalLink, true);

// Links are dofollow by default. The link box has a Dofollow / Nofollow choice; nofollow links are
// saved with rel="nofollow", which the public site keeps. Any rel containing nofollow (e.g. pasted
// "nofollow noopener") is read as nofollow.
const { Attributor, Scope } = Quill.import('parchment');
class NofollowAttributor extends Attributor {
  value(node) {
    return /(^|\s)nofollow(\s|$)/.test(node.getAttribute('rel') || '') ? 'nofollow' : '';
  }
}
Quill.register('formats/nofollow', new NofollowAttributor('nofollow', 'rel', { scope: Scope.INLINE, whitelist: ['nofollow'] }), true);

// Adds the Dofollow / Nofollow select to Quill's link box. While adding or editing a link the
// choice is applied on Save; on an existing link's preview it applies straight away.
function addRelSelect(quill) {
  const tooltip = quill.theme.tooltip;
  if (tooltip.relSelect) return;
  const select = document.createElement('select');
  select.className = 'ql-rel';
  select.title = 'Dofollow or nofollow';
  select.innerHTML = '<option value="dofollow">Dofollow</option><option value="nofollow">Nofollow</option>';
  tooltip.textbox.after(select);
  tooltip.relSelect = select;

  const apply = (range) => {
    if (range) quill.formatText(range.index, range.length, 'nofollow', select.value === 'nofollow' ? 'nofollow' : false, 'user');
  };
  const sync = (range) => {
    select.value = range && quill.getFormat(range.index, range.length).nofollow ? 'nofollow' : 'dofollow';
  };
  select.addEventListener('change', () => {
    if (!tooltip.root.classList.contains('ql-editing')) apply(tooltip.linkRange);
  });

  const { show, edit, save } = tooltip;
  tooltip.show = function () {
    show.call(this);
    sync(this.linkRange);
  };
  tooltip.edit = function (mode, preview) {
    edit.call(this, mode, preview);
    sync(this.linkRange || quill.selection.savedRange);
  };
  tooltip.save = function () {
    const linking = this.root.getAttribute('data-mode') === 'link' && this.textbox.value.trim();
    const range = this.linkRange || quill.selection.savedRange;
    save.call(this);
    if (linking) apply(range);
  };
}

// Runs for every editor Quill creates. The theme builds the link box alongside the toolbar
// module, so wait for it if this module happens to be created first. Also moves pasted images
// to the media bucket after each edit.
class LinkRelModule {
  constructor(quill) {
    const init = () => (quill.theme.tooltip ? addRelSelect(quill) : setTimeout(init));
    init();
    quill.on('text-change', (delta, oldDelta, source) => {
      if (source === 'user' && delta.ops.some((op) => op.insert?.image)) rehostImages(quill);
    });
    // Images already in an article being edited.
    setTimeout(() => rehostImages(quill));
  }
}
Quill.register('modules/linkRel', LinkRelModule, true);

// Everything pasted content can carry is kept: tables, images, font sizes, underline,
// strikethrough, superscript/subscript and code. Only pasted colours and fonts (e.g. from Google
// Docs) are dropped, so articles use the site's own colours and typefaces.
const EDITOR_FORMATS = [
  'header', 'size', 'bold', 'italic', 'underline', 'strike', 'script', 'code', 'list', 'indent', 'blockquote',
  'code-block', 'link', 'nofollow', 'image', 'align', 'table', 'table-row', 'table-body', 'table-container',
];

// Pasted or dropped images are moved to the media bucket, so articles never depend on base64 data
// or on another site's copy (e.g. a Google Docs image link, which stops working later).
const isHostedImage = (src) => src.includes('/storage/v1/object/public/media/');

async function rehostImage(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Not an image');
  const ext = blob.type.split('/')[1].replace('jpeg', 'jpg').replace(/\+.*$/, '');
  return uploadImage(new File([blob], `pasted.${ext}`, { type: blob.type }));
}

// Swaps every image in the editor that isn't in the media bucket yet for an uploaded copy.
// An image that can't be fetched (the other site blocks it) keeps its original link.
const rehosting = new Set();
function rehostImages(quill) {
  quill.root.querySelectorAll('img').forEach(async (img) => {
    const src = img.getAttribute('src') || '';
    if (!src || isHostedImage(src) || rehosting.has(src)) return;
    rehosting.add(src);
    try {
      const url = await rehostImage(src);
      const blot = Quill.find(img);
      if (!blot || !img.isConnected) return;
      const index = quill.getIndex(blot);
      const formats = quill.getFormat(index, 1);
      quill.deleteText(index, 1, 'api');
      quill.insertEmbed(index, 'image', url, 'api');
      if (formats.align) quill.formatLine(index, 1, 'align', formats.align, 'api');
    } catch (err) {
      console.warn('Could not copy pasted image to media storage; keeping its original link.', src, err);
    } finally {
      rehosting.delete(src);
    }
  });
}

// Font size: saved as an inline style (e.g. font-size: 18px) so the site shows it as written.
const SizeStyle = Quill.import('attributors/style/size');
SizeStyle.whitelist = FONT_SIZES;
Quill.register(SizeStyle, true);

// Keeps numbered headings, nested list items and font sizes from Google Docs (see lib/pasteHtml).
const Clipboard = Quill.import('modules/clipboard');
class PasteClipboard extends Clipboard {
  normalizeHTML(doc) {
    super.normalizeHTML(doc);
    normalizePastedHtml(doc);
  }
}
Quill.register('modules/clipboard', PasteClipboard, true);

// Pasted text often uses non-breaking spaces, which stop lines wrapping on the site.
const plainSpaces = (node, delta) => {
  delta.ops.forEach((op) => {
    if (typeof op.insert === 'string') op.insert = op.insert.replace(/\u00a0/g, ' ');
  });
  return delta;
};

// Quill stores a heading on the whole paragraph, so switching style while typing would restyle
// everything written before it. Instead:
// - cursor at the end of a line: start a new line in the chosen style and keep the text above as is;
// - selection: split off the selected text so only it changes;
// - cursor elsewhere in a line: restyle that line, as in Word or Google Docs.
function applyHeader(quill, value) {
  const header = value || false;
  const range = quill.getSelection(true);
  if (range.length === 0) {
    const [line, offset] = quill.getLine(range.index);
    const textLength = line.length() - 1;
    if (textLength > 0 && offset === textLength) {
      quill.insertText(range.index, '\n', line.formats(), 'user');
      quill.formatLine(range.index + 1, 0, 'header', header, 'user');
      quill.setSelection(range.index + 1, 0, 'user');
    } else {
      quill.formatLine(range.index, 0, 'header', header, 'user');
    }
    return;
  }
  let start = range.index;
  let end = range.index + range.length;
  // Split after the selection first, so `start` stays valid.
  const [endLine, endOffset] = quill.getLine(end);
  if (endOffset === 0) end -= 1;
  else if (endOffset < endLine.length() - 1) quill.insertText(end, '\n', endLine.formats(), 'user');
  const [startLine, startOffset] = quill.getLine(start);
  if (startOffset > 0) {
    quill.insertText(start, '\n', startLine.formats(), 'user');
    start += 1;
    end += 1;
  }
  quill.formatLine(start, end - start, 'header', header, 'user');
  quill.setSelection(start, end - start, 'user');
}

// List buttons. A Quill line is a heading or a list item, never both, so on heading lines the
// number ("1. ") or bullet ("• ") is written in front of the heading instead, the same way
// numbered headings pasted from Google Docs come in. Headings are numbered in sequence with the
// previous same-level heading, restarting after a higher-level one. Clicking again removes it.
const HEADING_PREFIX = { ordered: /^\d+\.\s/, bullet: /^•\s/ };

function nextHeadingNumber(quill, line) {
  const level = line.formats().header;
  for (let prev = line.prev; prev; prev = prev.prev) {
    const prevLevel = prev.formats?.().header;
    if (!prevLevel) continue;
    if (prevLevel < level) break;
    if (prevLevel === level) {
      const match = /^(\d+)\.\s/.exec(quill.getText(quill.getIndex(prev), prev.length()));
      return match ? Number(match[1]) + 1 : 1;
    }
  }
  return 1;
}

function applyList(quill, value) {
  const range = quill.getSelection(true);
  const lines = quill.getLines(range.index, Math.max(range.length, 1));
  const headings = lines.filter((line) => line.formats().header);
  if (!headings.length) {
    quill.format('list', value, 'user');
    return;
  }
  const type = value || 'ordered';
  const textOf = (line) => quill.getText(quill.getIndex(line), line.length());
  const remove = headings.every((line) => HEADING_PREFIX[type].test(textOf(line)));
  headings.forEach((line) => {
    const index = quill.getIndex(line);
    const text = textOf(line);
    // Drop any existing number or bullet first, so switching between the two works.
    const existing = /^(\d+\.|•)\s/.exec(text);
    if (existing) quill.deleteText(index, existing[0].length, 'user');
    if (!remove) quill.insertText(index, type === 'ordered' ? `${nextHeadingNumber(quill, line)}. ` : '• ', 'user');
  });
  lines.filter((line) => !line.formats().header).forEach((line) => {
    quill.formatLine(quill.getIndex(line), 1, 'list', value, 'user');
  });
}

// Clear formatting. Quill's built-in version does nothing visible without a selection and
// deletes images inside one, so instead strip every format, from the current line when
// nothing is selected, and leave images alone.
const INLINE_FORMATS = ['size', 'bold', 'italic', 'underline', 'strike', 'script', 'code', 'link', 'nofollow'];
const BLOCK_FORMATS = ['header', 'list', 'indent', 'blockquote', 'code-block', 'align'];
const unset = (names) => Object.fromEntries(names.map((name) => [name, false]));
function clearFormatting(quill) {
  const range = quill.getSelection(true);
  const [line, offset] = quill.getLine(range.index);
  const { index, length } = range.length ? range : { index: range.index - offset, length: line.length() - 1 };
  quill.formatLine(index, length, unset(BLOCK_FORMATS), 'user');
  quill.formatText(index, length, unset(INLINE_FORMATS), 'user');
}

// Hover labels for the toolbar, which has none by default.
const TOOLBAR_TITLES = {
  '.ql-header .ql-picker-label': 'Text style',
  '.ql-size .ql-picker-label': 'Font size',
  '.ql-bold': 'Bold',
  '.ql-underline': 'Underline',
  '.ql-italic': 'Italic',
  '.ql-list[value="ordered"]': 'Numbered list',
  '.ql-list[value="bullet"]': 'Bulleted list',
  '.ql-blockquote': 'Quote',
  '.ql-link': 'Link',
  '.ql-image': 'Insert image',
  '.ql-align .ql-picker-label': 'Alignment',
  '.ql-clean': 'Clear formatting',
};

// Radix Select can't use an empty value, so "no author" gets a sentinel.
const NO_AUTHOR = '__none__';

const emptyArticle = {
  title: '', slug: '', excerpt: '', body: '', featured_image: '', image_alt: '', image_attribution: '',
  category: '', author_id: '', status: 'draft', published_date: '', seo_title: '', meta_description: '',
  references: '', faqs: [],
};

// kind="news" edits a news item: the category is fixed to News and the item lives at /news on the site.
export default function ArticleEditor({ kind = 'articles' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = !!id;
  const isNewsMode = kind === 'news';
  const listPath = isNewsMode ? '/news' : '/';

  const [form, setForm] = useState(isNewsMode ? { ...emptyArticle, category: NEWS_CATEGORY } : emptyArticle);
  // The rich-text editor mounts only once the article's content is in the form; content
  // arriving after mount is lost when React re-mounts components in development.
  const [contentReady, setContentReady] = useState(!isEdit);
  const [slugTouched, setSlugTouched] = useState(false);
  // Which action is in progress: 'schedule', 'publish' or null. Only that button shows a spinner.
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');
  const quillRef = useRef();

  const { data: existing, isLoading } = useQuery({
    queryKey: ['admin-article', id],
    queryFn: async () => unwrap(await supabase.from('articles').select('*').eq('id', id).single()),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) {
      // If an update is scheduled, edit that pending version rather than the live one.
      const version = { ...existing, ...(existing.scheduled_changes || {}) };
      setForm({
        ...emptyArticle,
        ...version,
        published_date: toLocalInput(existing.published_date),
        author_id: version.author_id || '',
        faqs: Array.isArray(version.faqs) ? version.faqs : [],
        ...(isNewsMode ? { category: NEWS_CATEGORY } : {}),
      });
      setContentReady(true);
    }
  }, [existing, isNewsMode]);

  const { data: authors = [] } = useQuery({ queryKey: ['authors'], queryFn: fetchAuthors });

  const { data: categoriesRes } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const rows = unwrap(await supabase.from('articles').select('category').neq('category', '').limit(1000));
      return [...new Set(rows.map((r) => r.category))].filter((c) => c !== NEWS_CATEGORY).sort();
    },
  });
  const categories = categoriesRes || [];

  const update = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const addFaq = () => setForm((f) => ({ ...f, faqs: [...f.faqs, { question: '', answer: '' }] }));
  const removeFaq = (index) => setForm((f) => ({ ...f, faqs: f.faqs.filter((_, i) => i !== index) }));
  const updateFaq = (index, field) => (e) =>
    setForm((f) => ({ ...f, faqs: f.faqs.map((faq, i) => (i === index ? { ...faq, [field]: e.target.value } : faq)) }));
  const moveFaq = (index, delta) =>
    setForm((f) => {
      const faqs = [...f.faqs];
      [faqs[index], faqs[index + delta]] = [faqs[index + delta], faqs[index]];
      return { ...f, faqs };
    });

  const onTitleChange = (e) => {
    const title = e.target.value;
    setForm((f) => ({ ...f, title, slug: slugTouched ? f.slug : slugify(title) }));
  };
  // Light cleanup while typing so hyphens can be typed; the full slugify runs on blur and on save.
  const onSlugChange = (e) => {
    setSlugTouched(true);
    const slug = e.target.value.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-{2,}/g, '-');
    setForm((f) => ({ ...f, slug }));
  };
  const onSlugBlur = () => setForm((f) => ({ ...f, slug: slugify(f.slug) }));

  const imageHandler = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.click();
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const file_url = await uploadImage(file);
        const quill = quillRef.current?.getEditor();
        const range = quill?.getSelection();
        if (quill && range) quill.insertEmbed(range.index, 'image', file_url);
      } catch (err) {
        console.error(err);
        alert('Image upload failed. Please try again.');
      }
    };
  };

  const modules = useMemo(() => ({
    toolbar: {
      container: [
        [{ header: [1, 2, 3, 4, 5, 6, false] }],
        // false = no size set, the article's default 18px; listed in its place between 16 and 20.
        [{ size: [...FONT_SIZES.filter((z) => parseFloat(z) < 18), false, ...FONT_SIZES.filter((z) => parseFloat(z) > 18)] }],
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['blockquote'],
        ['link', 'image'],
        [{ align: [] }],
        ['clean'],
      ],
      handlers: {
        image: imageHandler,
        header(value) { applyHeader(this.quill, value); },
        list(value) { applyList(this.quill, value); },
        clean() { clearFormatting(this.quill); },
      },
    },
    clipboard: { matchers: [[Node.TEXT_NODE, plainSpaces]] },
    table: true,
    // Image files pasted or dropped into the editor (e.g. screenshots) upload straight to media.
    uploader: {
      mimetypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'],
      async handler(range, files) {
        for (const [i, file] of files.entries()) {
          try {
            this.quill.insertEmbed(range.index + i, 'image', await uploadImage(file), 'user');
          } catch (err) {
            console.error(err);
            alert('Image upload failed. Please try again.');
          }
        }
        this.quill.setSelection(range.index + files.length, 0, 'silent');
      },
    },
    linkRel: true,
  }), []);

  useEffect(() => {
    // `.editor` rather than getEditor(), which throws while the editor is being (re)created.
    const toolbar = quillRef.current?.editor?.getModule('toolbar')?.container;
    if (!toolbar) return;
    Object.entries(TOOLBAR_TITLES).forEach(([selector, title]) => {
      toolbar.querySelectorAll(selector).forEach((el) => el.setAttribute('title', title));
    });
  }, [contentReady]);

  const uploadFeatured = async (file) => {
    try {
      const file_url = await uploadImage(file);
      setForm((f) => ({ ...f, featured_image: file_url }));
    } catch (err) {
      console.error(err);
      alert('Image upload failed.');
    }
  };

  const buildPayload = (override = {}) => {
    const payload = {
      title: form.title.trim(),
      slug: slugify(form.slug),
      excerpt: form.excerpt.trim(),
      // Quill 2 exports every space as &nbsp;, which stops lines wrapping on the site.
      body: form.body.replace(/&nbsp;/g, ' '),
      featured_image: form.featured_image,
      image_alt: form.image_alt.trim(),
      image_attribution: form.image_attribution.trim(),
      category: isNewsMode ? NEWS_CATEGORY : form.category.trim(),
      author_id: form.author_id || null,
      // Keep the plain-text name in sync for older code paths that still read it.
      author: authors.find((a) => a.id === form.author_id)?.name || '',
      seo_title: form.seo_title.trim(),
      meta_description: form.meta_description.trim(),
      references: form.references,
      // Drop empty rows; keep only complete question/answer pairs.
      faqs: form.faqs
        .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
        .filter((f) => f.question && f.answer),
      ...override,
    };
    return payload;
  };

  const checkSlugUnique = async (slug) => {
    const rows = unwrap(await supabase.from('articles').select('id').eq('slug', slug).limit(20));
    return !rows.some((a) => a.id !== id);
  };

  // Returns an error message, or '' when the article can be saved.
  const validate = async () => {
    if (!form.title.trim()) return 'A title is required.';
    const slug = slugify(form.slug);
    if (!slug) return 'A URL slug is required.';
    if (!(await checkSlugUnique(slug))) return 'That slug is already in use. Choose another.';
    return '';
  };

  // Is the saved article currently visible on the site? Then scheduling stores a pending update
  // instead of touching the live version.
  const isLive = !!existing && existing.status === 'published' && !!existing.published_date
    && new Date(existing.published_date) <= new Date();
  const pendingUpdateAt = existing?.scheduled_changes && existing?.scheduled_at ? existing.scheduled_at : null;

  const persist = async (payload) => {
    const { error: saveError } = isEdit
      ? await supabase.from('articles').update(payload).eq('id', id)
      : await supabase.from('articles').insert(payload);
    if (saveError) throw saveError;
    qc.invalidateQueries({ queryKey: ['admin-articles'] });
    qc.invalidateQueries({ queryKey: ['admin-article', id] });
    qc.invalidateQueries({ queryKey: ['admin-counts'] });
    qc.invalidateQueries({ queryKey: ['categories'] });
    navigate(listPath);
  };

  // Publish: live immediately. An article that is already live keeps its original publish date.
  // Applying edits now also drops any pending scheduled update.
  const publishNow = () =>
    persist({
      ...buildPayload(),
      ...(isLive ? {} : { status: 'published', published_date: new Date().toISOString() }),
      scheduled_changes: null,
      scheduled_at: null,
    });

  // Publish: validate first, then confirm in a dialog.
  const [publishOpen, setPublishOpen] = useState(false);
  const openPublish = async () => {
    setError('');
    setSaving('publish');
    const problem = await validate();
    setSaving(null);
    if (problem) { setError(problem); return; }
    setPublishOpen(true);
  };

  // Live article: keep the live version and store these edits to apply at `when`.
  // Otherwise: the whole article goes live at `when`.
  const schedule = (when) =>
    persist(isLive
      ? { scheduled_changes: buildPayload(), scheduled_at: when }
      : { ...buildPayload(), status: 'published', published_date: when, scheduled_changes: null, scheduled_at: null });

  const [discardOpen, setDiscardOpen] = useState(false);
  const discardScheduledUpdate = async () => {
    const { error: discardError } = await supabase.from('articles').update({ scheduled_changes: null, scheduled_at: null }).eq('id', id);
    if (discardError) throw discardError;
    qc.invalidateQueries({ queryKey: ['admin-articles'] });
    await qc.invalidateQueries({ queryKey: ['admin-article', id] });
  };

  // Schedule: validate first, then ask for the date and time in a dialog.
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const openSchedule = async () => {
    setError('');
    setSaving('schedule');
    const problem = await validate();
    setSaving(null);
    if (problem) { setError(problem); return; }
    setScheduleOpen(true);
  };

  // Current publishing state, shown in the sidebar.
  const liveDate = fromLocalInput(form.published_date);
  const publishState = form.status !== 'published' || !liveDate
    ? { label: 'Draft', text: 'Not published yet.', cls: 'bg-muted text-muted-foreground border-border' }
    : new Date(liveDate) > new Date()
      ? { label: 'Scheduled', text: `Goes live ${new Date(liveDate).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.`, cls: 'bg-amber-50 text-amber-700 border-amber-200' }
      : { label: 'Live', text: `Published ${new Date(liveDate).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.${pendingUpdateAt ? ` Update scheduled for ${new Date(pendingUpdateAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.` : ''}`, cls: 'bg-accent/10 text-accent border-accent/20' };

  const noun = isNewsMode ? 'news item' : 'article';
  const formatWhen = (date) => new Date(date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  if (isEdit && isLoading) {
    return <div className="p-12 text-center text-muted-foreground">Loading editor…</div>;
  }

  const inputCls = 'w-full rounded-sm border border-border bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-accent';

  return (
    <div className="px-5 sm:px-8 py-8 max-w-[1000px]">
      <div className="flex items-center justify-between mb-6">
        <Link to={listPath} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {isNewsMode ? 'Back to news' : 'Back to dashboard'}
        </Link>
        <div className="flex items-center gap-2">
          {publishState.label === 'Live' && form.slug && PUBLIC_SITE_URL && (
            <a href={`${PUBLIC_SITE_URL}${publicPath(form)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-2 text-sm font-medium hover:border-foreground">
              <Eye className="h-4 w-4" /> Preview
            </a>
          )}
          <button onClick={openSchedule} disabled={!!saving} className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 text-sm font-semibold hover:border-foreground disabled:opacity-60">
            {saving === 'schedule' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />} Schedule
          </button>
          <button onClick={openPublish} disabled={!!saving} className="inline-flex items-center gap-2 rounded-sm bg-foreground px-4 py-2 text-sm font-semibold text-background hover:bg-accent disabled:opacity-60">
            {saving === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Publish
          </button>
        </div>
      </div>

      <h1 className="font-heading text-2xl font-semibold tracking-tight mb-6">{`${isEdit ? 'Edit' : 'New'} ${isNewsMode ? 'news item' : 'article'}`}</h1>

      {isLive && pendingUpdateAt && (
        <div className="mb-6 flex flex-col gap-3 rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="font-semibold">Scheduled update:</span> these changes replace the live version on {new Date(pendingUpdateAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.
            The site shows the current version until then.
          </p>
          <button
            type="button"
            onClick={() => setDiscardOpen(true)}
            className="shrink-0 inline-flex items-center gap-2 rounded-sm border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:border-amber-500"
          >
            Discard scheduled update
          </button>
        </div>
      )}

      {error && <div className="mb-4 rounded-sm border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5">Title</label>
            <input value={form.title} onChange={onTitleChange} placeholder="Article headline" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">URL slug</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:inline">/{isNewsMode || form.category.trim() === NEWS_CATEGORY ? 'news' : 'articles'}/</span>
              <input value={form.slug} onChange={onSlugChange} onBlur={onSlugBlur} placeholder="article-slug" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Excerpt</label>
            <textarea value={form.excerpt} onChange={update('excerpt')} rows={2} placeholder="A short summary shown in previews" className={`${inputCls} resize-y`} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Content</label>
            <div className="quill-wrapper">
              {contentReady ? (
                <ReactQuill
                  key={id || 'new'}
                  ref={quillRef}
                  theme="snow"
                  value={form.body}
                  // Store exactly what Quill emits. Changing it here makes Quill reload the whole
                  // document on every keystroke, which eats typed spaces and merges lines.
                  onChange={(v) => setForm((f) => ({ ...f, body: v }))}
                  modules={modules}
                  formats={EDITOR_FORMATS}
                  placeholder="Write your article…"
                />
              ) : (
                <div className="flex min-h-[360px] items-center justify-center rounded-sm border border-border bg-white text-sm text-muted-foreground">Loading content…</div>
              )}
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-sm font-medium">FAQs <span className="text-muted-foreground font-normal">(shown at the end of the article)</span></label>
              <button type="button" onClick={addFaq} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">
                <Plus className="h-4 w-4" /> Add FAQ
              </button>
            </div>
            {form.faqs.length === 0 ? (
              <button type="button" onClick={addFaq} className="w-full rounded-sm border border-dashed border-border py-6 text-sm text-muted-foreground hover:border-accent transition-colors">
                No FAQs yet. Add a question readers often ask about this topic.
              </button>
            ) : (
              <ol className="space-y-3">
                {form.faqs.map((faq, i) => (
                  <li key={i} className="rounded-sm border border-border bg-white p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold tabular-nums text-muted-foreground">Q{i + 1}</span>
                      <input value={faq.question} onChange={updateFaq(i, 'question')} placeholder="Question" className={inputCls} />
                      <div className="flex shrink-0 items-center">
                        <button type="button" onClick={() => moveFaq(i, -1)} disabled={i === 0} title="Move up" className="p-1.5 rounded-sm text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                        <button type="button" onClick={() => moveFaq(i, 1)} disabled={i === form.faqs.length - 1} title="Move down" className="p-1.5 rounded-sm text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                        <button type="button" onClick={() => removeFaq(i)} title="Remove" className="p-1.5 rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                    <textarea value={faq.answer} onChange={updateFaq(i, 'answer')} rows={3} placeholder="Answer" className={`${inputCls} resize-y`} />
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">References <span className="text-muted-foreground font-normal">(one per line)</span></label>
            <textarea value={form.references} onChange={update('references')} rows={4} placeholder="https://example.com/source&#10;Author, Title, Year" className={`${inputCls} resize-y font-mono text-xs`} />
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-sm border border-border bg-white p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Status</h3>
              <span className={`rounded-sm border px-2 py-0.5 text-xs font-medium ${publishState.cls}`}>{publishState.label}</span>
            </div>
            <p className="text-sm text-muted-foreground">{publishState.text}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Publish</span> puts the article live now. <span className="font-medium text-foreground">Schedule</span> picks a date and time for it to go live.
            </p>
          </div>

          <div className="rounded-sm border border-border bg-white p-4 space-y-4">
            <h3 className="text-sm font-semibold">Featured image</h3>
            {form.featured_image ? (
              <div className="relative">
                <img src={form.featured_image} alt="Featured" className="w-full rounded-sm" />
                <button onClick={() => setForm((f) => ({ ...f, featured_image: '' }))} className="absolute top-2 right-2 rounded-sm bg-foreground/80 p-1.5 text-background hover:bg-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-border py-8 cursor-pointer hover:border-accent transition-colors">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Upload image</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFeatured(f); }} />
              </label>
            )}
            <div>
              <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Alt text</label>
              <input value={form.image_alt} onChange={update('image_alt')} className={inputCls} placeholder="Describe the image" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Attribution / caption</label>
              <input value={form.image_attribution} onChange={update('image_attribution')} className={inputCls} placeholder="Photo credit" />
            </div>
          </div>

          <div className="rounded-sm border border-border bg-white p-4 space-y-4">
            <h3 className="text-sm font-semibold">Organization</h3>
            <div>
              <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Category</label>
              {isNewsMode ? (
                <p className="rounded-sm border border-border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">News</p>
              ) : (
                <>
                  <input value={form.category} onChange={update('category')} list="category-list" className={inputCls} placeholder="e.g. Lower back pain" />
                  <datalist id="category-list">
                    {categories.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </>
              )}
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-xs font-medium text-muted-foreground">Author</label>
                <Link to="/authors" className="text-xs font-semibold text-accent hover:underline">Manage authors</Link>
              </div>
              {authors.length === 0 ? (
                <Link to="/authors" className="block rounded-sm border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:border-accent">
                  No authors yet. Add one first.
                </Link>
              ) : (
                <Select
                  value={form.author_id || NO_AUTHOR}
                  onChange={(value) => setForm((f) => ({ ...f, author_id: value === NO_AUTHOR ? '' : value }))}
                  options={[{ value: NO_AUTHOR, label: 'No author' }, ...authors.map((a) => ({ value: a.id, label: a.role ? `${a.name} — ${a.role}` : a.name }))]}
                  aria-label="Author"
                />
              )}
            </div>
          </div>

          <div className="rounded-sm border border-border bg-white p-4 space-y-4">
            <h3 className="text-sm font-semibold">SEO</h3>
            <div>
              <label className="block text-xs font-medium mb-1.5 text-muted-foreground">SEO title</label>
              <input value={form.seo_title} onChange={update('seo_title')} className={inputCls} placeholder="Defaults to article title" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5 text-muted-foreground">Meta description</label>
              <textarea value={form.meta_description} onChange={update('meta_description')} rows={3} className={`${inputCls} resize-y`} placeholder="Summary for search engines" />
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        tone="default"
        icon={Globe}
        title={isLive ? `Update the live ${noun}?` : `Publish this ${noun}?`}
        description={isLive
          ? <>Your changes will replace the version readers see on the site right now.{pendingUpdateAt && ` The update scheduled for ${formatWhen(pendingUpdateAt)} will be dropped.`}</>
          : <>“{form.title.trim()}” will go live on the site immediately and be visible to everyone.{publishState.label === 'Scheduled' && ` It will no longer wait until ${formatWhen(liveDate)}.`}</>}
        confirmLabel={isLive ? 'Update now' : 'Publish now'}
        onConfirm={publishNow}
      />

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        icon={CalendarX}
        title="Discard the scheduled update?"
        description={<>The changes set to go live on {pendingUpdateAt && formatWhen(pendingUpdateAt)} will be deleted. The live version stays as it is. This cannot be undone.</>}
        confirmLabel="Discard update"
        onConfirm={discardScheduledUpdate}
      />

      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        current={isLive ? pendingUpdateAt : liveDate}
        description={isLive
          ? 'The current version stays on the site until then. At the time you choose, your changes replace it automatically.'
          : 'It is saved now and goes live on the site automatically at the time you choose.'}
        onSchedule={schedule}
      />
    </div>
  );
}
