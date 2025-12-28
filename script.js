// ACT Showcase - Love Edition with server persistence (PHP API) + local fallback for defaults
(function () {
  'use strict';

  // Utilities
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const on = (el, ev, fn, opts) => el.addEventListener(ev, fn, opts);
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // Theme Manager
  const Theme = (() => {
    const KEY = 'act-theme';
    const root = document.documentElement;
    const get = () => localStorage.getItem(KEY) || 'dark';
    const apply = (mode) => { if (mode === 'light') root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme'); };
    const toggle = () => { const next = get() === 'light' ? 'dark' : 'light'; localStorage.setItem(KEY, next); apply(next); return next; };
    apply(get());
    return { get, toggle };
  })();

  // Default deletions (for built-in images) tracked per origin
  const DefaultDeletes = (() => {
    const KEY = 'love-default-hidden';
    const load = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); } };
    const save = (set) => localStorage.setItem(KEY, JSON.stringify(Array.from(set)));
    const add = (src) => { const s = load(); s.add(src); save(s); };
    const has = (src) => load().has(src);
    return { add, has };
  })();

  // Customizable filter labels persisted in localStorage
  const FilterLabels = (() => {
    const KEY = 'love-filter-labels';
    const defaults = { all: 'All', nature: 'Us', city: 'Adventures', abstract: 'Dreams' };
    const getAll = () => { try { return { ...defaults, ...(JSON.parse(localStorage.getItem(KEY) || '{}')) }; } catch { return { ...defaults }; } };
    const set = (tag, label) => { const data = getAll(); data[tag] = label || defaults[tag] || tag; localStorage.setItem(KEY, JSON.stringify(data)); };
    return { getAll, set };
  })();

  // API client
  const API = (() => {
    const base = 'api/index.php';
    async function list() {
      const res = await fetch(`${base}?action=list`, { cache: 'no-store' });
      if (!res.ok) throw new Error('List failed');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'List error');
      return data.items || [];
    }
    async function upload(files, { tag, captionText, alt }) {
      const fd = new FormData();
      for (const f of files) fd.append('files[]', f);
      fd.append('action', 'upload');
      if (tag) fd.append('tag', tag);
      if (captionText) fd.append('captionText', captionText);
      if (alt) fd.append('alt', alt);
      const res = await fetch(base, { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Upload error');
      return data.items || [];
    }
    async function update(item) {
      const res = await fetch(`${base}?action=update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) });
      if (!res.ok) throw new Error('Update failed');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Update error');
      return data.item;
    }
    async function remove(id) {
      const res = await fetch(`${base}?action=delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (!res.ok) throw new Error('Delete failed');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Delete error');
      return true;
    }
    return { list, upload, update, remove };
  })();

  // Masonry Grid Controller
  const Grid = (() => {
    const grid = $('#grid');
    const getCols = () => Number(grid?.dataset.columns || 3);
    const setCols = (n) => { grid.dataset.columns = n; grid.style.setProperty('--cols', n); };
    setCols(getCols());
    const filter = (tag) => {
      const cards = $$('.card', grid);
      cards.forEach(card => {
        const match = tag === 'all' || card.dataset.tag === tag;
        card.style.display = match ? '' : 'none';
      });
    };
    return { grid, getCols, setCols, filter };
  })();

  // Lightbox
  const Lightbox = (() => {
    const el = $('#lightbox');
    const img = $('#lightboxImage');
    const caption = $('#lightboxCaption');
    let items = [];
    let idx = 0;
    const open = (index, collection) => { items = collection; idx = index; update(); el.setAttribute('aria-hidden', 'false'); trapFocus(); };
    const close = () => { el.setAttribute('aria-hidden', 'true'); releaseFocus(); };
    const next = () => { idx = (idx + 1) % items.length; update(); };
    const prev = () => { idx = (idx - 1 + items.length) % items.length; update(); };
    const update = () => { const { src, alt, captionText } = items[idx] || {}; img.src = src || ''; img.alt = alt || ''; caption.textContent = captionText || ''; };
    const focusables = () => $$('button, [href], [tabindex]:not([tabindex="-1"])', el).filter(n => !n.hasAttribute('disabled'));
    let lastFocused;
    const trapFocus = () => { lastFocused = document.activeElement; const list = focusables(); list[0]?.focus(); on(el, 'keydown', handleKey); };
    const releaseFocus = () => { el.removeEventListener('keydown', handleKey); lastFocused?.focus(); };
    const handleKey = (e) => { if (e.key === 'Escape') return close(); if (e.key === 'ArrowRight') return next(); if (e.key === 'ArrowLeft') return prev(); if (e.key === 'Tab') { const nodes = focusables(); if (!nodes.length) return; const first = nodes[0]; const last = nodes[nodes.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } };
    on(el, 'click', (e) => { const t = e.target; if (t.matches('.lightbox')) return close(); if (t.closest('[data-action="close"]')) return close(); if (t.closest('[data-action="next"]')) return next(); if (t.closest('[data-action="prev"]')) return prev(); });
    return { open, close };
  })();

  // Rendering helpers
  function buildCard({ id, src, alt, captionText, tag = 'nature', builtin = false }) {
    const figure = document.createElement('figure');
    figure.className = 'card';
    if (id) figure.dataset.id = id;
    figure.dataset.tag = tag;
    if (builtin) figure.dataset.builtin = '1';

    const del = document.createElement('button');
    del.className = 'action-delete';
    del.setAttribute('title', 'Delete');
    del.setAttribute('aria-label', 'Delete');
    del.textContent = '✕';

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = src;
    img.alt = alt || '';

    const figcap = document.createElement('figcaption');
    figcap.textContent = captionText || '';
    figcap.contentEditable = id ? 'true' : 'false';
    figcap.setAttribute('role', 'textbox');
    figcap.setAttribute('aria-label', 'Edit caption');

    figure.appendChild(del);
    figure.appendChild(img);
    figure.appendChild(figcap);

    return figure;
  }

  function rebuildLightboxItems() {
    return $$('.card').map(card => {
      const img = $('img', card);
      const cap = $('figcaption', card)?.textContent?.trim();
      return { src: img.src, alt: img.alt, captionText: cap };
    });
  }

  function attachCardOpen(card) {
    on(card, 'click', (e) => {
      if (e.target.closest('.action-delete') || e.target.tagName === 'FIGCAPTION') return;
      const cards = $$('.card');
      const idx = cards.indexOf(card);
      const items = rebuildLightboxItems();
      if (idx >= 0) Lightbox.open(idx, items);
    });
  }

  function attachCaptionEditing(card) {
    const id = card.dataset.id;
    if (!id) return;
    const figcap = $('figcaption', card);
    if (!figcap) return;
    on(figcap, 'blur', async () => {
      try { await API.update({ id, captionText: figcap.textContent.trim() }); } catch {}
    });
  }

  function applyFilterLabels() {
    const labels = FilterLabels.getAll();
    $$('.filter-group .chip').forEach(chip => { const k = chip.dataset.filter; if (labels[k]) chip.textContent = labels[k]; });
  }

  function enableFilterLabelEditing() {
    $$('.filter-group .chip').forEach(chip => {
      on(chip, 'dblclick', () => {
        const k = chip.dataset.filter; if (!k) return;
        const next = window.prompt('Rename this filter label:', chip.textContent.trim());
        if (next && next.trim()) { FilterLabels.set(k, next.trim()); applyFilterLabels(); }
      });
    });
  }

  function promptForCategory() {
    const labels = FilterLabels.getAll();
    const map = [ { tag: 'nature', label: labels.nature }, { tag: 'city', label: labels.city }, { tag: 'abstract', label: labels.abstract } ];
    const choice = window.prompt(`Where should these photos be stored?\n1) ${map[0].label}\n2) ${map[1].label}\n3) ${map[2].label}\nEnter 1, 2, or 3:`, '1');
    const idx = Number(choice) - 1;
    return map[idx]?.tag || 'nature';
  }

  // Wire up controls once DOM is ready
  on(document, 'DOMContentLoaded', async () => {
    // Theme
    const themeBtn = $('#themeToggle');
    if (themeBtn) on(themeBtn, 'click', () => { const mode = Theme.toggle(); themeBtn.setAttribute('aria-pressed', String(mode === 'light')); });

    // Filter labels
    applyFilterLabels();
    enableFilterLabelEditing();

    // Filters
    $$('.filter-group .chip').forEach(chip => {
      on(chip, 'click', () => {
        $$('.filter-group .chip').forEach(c => { c.classList.remove('is-active'); c.setAttribute('aria-pressed', 'false'); });
        chip.classList.add('is-active');
        chip.setAttribute('aria-pressed', 'true');
        Grid.filter(chip.dataset.filter);
      });
    });

    // Layout
    $$('.layout-group .chip').forEach(chip => {
      on(chip, 'click', () => {
        $$('.layout-group .chip').forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        Grid.setCols(Number(chip.dataset.cols));
      });
    });

    const gridEl = Grid.grid;

    // Remove defaults previously deleted
    $$('.card', gridEl).forEach(card => { const img = $('img', card); const key = img?.getAttribute('src'); if (key && DefaultDeletes.has(key)) card.remove(); });

    // Load items from server and inject at top (newest first)
    try {
      const items = await API.list();
      items.forEach(item => {
        const card = buildCard(item);
        gridEl.insertBefore(card, gridEl.firstChild);
        attachCardOpen(card);
        attachCaptionEditing(card);
      });
    } catch {}

    // Attach interactions for remaining default cards (no caption editing)
    $$('.card', gridEl).forEach(attachCardOpen);

    // Upload handler
    const uploadBtn = $('#uploadBtn');
    const uploadInput = $('#uploadInput');
    if (uploadBtn && uploadInput) {
      on(uploadBtn, 'click', () => uploadInput.click());
      on(uploadInput, 'change', async () => {
        const files = Array.from(uploadInput.files || []);
        if (!files.length) return;
        const tag = promptForCategory();
        try {
          const uploaded = await API.upload(files, { tag });
          // newest first: insert each at top in returned order
          uploaded.forEach(item => {
            const card = buildCard(item);
            gridEl.insertBefore(card, gridEl.firstChild);
            attachCardOpen(card);
            attachCaptionEditing(card);
          });
        } catch (e) {
          alert('Upload failed. Please try again.');
        }
        uploadInput.value = '';
      });
    }

    // Delete handling
    on(gridEl, 'click', async (e) => {
      const btn = e.target.closest('.action-delete');
      if (!btn) return;
      e.stopPropagation();
      const card = btn.closest('.card');
      if (!card) return;
      const id = card.dataset.id;
      if (id) {
        try { await API.remove(id); card.remove(); } catch { alert('Failed to delete.'); }
      } else {
        const img = $('img', card);
        const key = img?.getAttribute('src');
        if (key) DefaultDeletes.add(key);
        card.remove();
      }
    });
  });
})();
