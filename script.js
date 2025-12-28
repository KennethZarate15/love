// ACT Showcase - Love Edition with persistence and editable captions/categories
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

  // Persistence: IndexedDB for uploaded items
  const DB = (() => {
    const DB_NAME = 'loveGallery';
    const STORE = 'items';
    let db;

    function open() {
      return new Promise((resolve, reject) => {
        if (db) return resolve(db);
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
          const d = e.target.result;
          if (!d.objectStoreNames.contains(STORE)) {
            d.createObjectStore(STORE, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => { db = req.result; resolve(db); };
        req.onerror = () => reject(req.error);
      });
    }

    async function getAll() {
      const d = await open();
      return new Promise((resolve, reject) => {
        const tx = d.transaction(STORE, 'readonly');
        const st = tx.objectStore(STORE);
        const req = st.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }

    async function put(item) {
      const d = await open();
      return new Promise((resolve, reject) => {
        const tx = d.transaction(STORE, 'readwrite');
        const st = tx.objectStore(STORE);
        const req = st.put(item);
        req.onsuccess = () => resolve(item);
        req.onerror = () => reject(req.error);
      });
    }

    async function remove(id) {
      const d = await open();
      return new Promise((resolve, reject) => {
        const tx = d.transaction(STORE, 'readwrite');
        const st = tx.objectStore(STORE);
        const req = st.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    return { getAll, put, remove };
  })();

  // Track deletions of built-in default cards (by src) using localStorage
  const DefaultDeletes = (() => {
    const KEY = 'love-default-hidden';
    const load = () => {
      try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); }
    };
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
    return { getCols, setCols, filter, grid };
  })();

  // Lightbox Viewer
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
    on(el, 'click', (e) => { const t = e.target; if (t.matches('.lightbox')) return close(); if (t.closest('[data-action=\"close\"]')) return close(); if (t.closest('[data-action=\"next\"]')) return next(); if (t.closest('[data-action=\"prev\"]')) return prev(); });
    return { open, close };
  })();

  // Rendering helpers
  function buildCard({ id, src, alt, captionText, tag = 'nature' }) {
    const figure = document.createElement('figure');
    figure.className = 'card';
    if (id) figure.dataset.id = id;
    figure.dataset.tag = tag;

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
    figcap.contentEditable = 'true';
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

  // Inline caption persistence for uploaded items
  function attachCaptionEditing(card) {
    const id = card.dataset.id;
    if (!id) return; // Only persist for uploaded items; defaults remain static (unless needed)
    const figcap = $('figcaption', card);
    if (!figcap) return;
    on(figcap, 'blur', async () => {
      try {
        // Load, update, and save the single item by id
        const all = await DB.getAll();
        const item = all.find(i => i.id === id);
        if (item) { item.captionText = figcap.textContent.trim(); await DB.put(item); }
      } catch {}
    });
  }

  // Upload category selection prompt
  function promptForCategory() {
    // Simple prompt cycling through allowed tags; replace with custom dialog if desired
    const labels = FilterLabels.getAll();
    const map = [
      { tag: 'nature', label: labels.nature },
      { tag: 'city', label: labels.city },
      { tag: 'abstract', label: labels.abstract },
    ];
    const choice = window.prompt(`Where should these photos be stored?\n1) ${map[0].label}\n2) ${map[1].label}\n3) ${map[2].label}\nEnter 1, 2, or 3:`, '1');
    const idx = Number(choice) - 1;
    return map[idx]?.tag || 'nature';
  }

  // Allow renaming filter chips with persistence
  function applyFilterLabels() {
    const labels = FilterLabels.getAll();
    const chips = $$('.filter-group .chip');
    chips.forEach(chip => {
      const key = chip.dataset.filter;
      if (labels[key]) chip.textContent = labels[key];
    });
  }

  function enableFilterLabelEditing() {
    // Double-click filter chips to rename
    $$('.filter-group .chip').forEach(chip => {
      on(chip, 'dblclick', () => {
        const key = chip.dataset.filter;
        if (!key) return;
        const current = chip.textContent.trim();
        const next = window.prompt('Rename this filter label:', current);
        if (next && next.trim()) {
          FilterLabels.set(key, next.trim());
          applyFilterLabels();
        }
      });
    });
  }

  // Wire up controls once DOM is ready
  on(document, 'DOMContentLoaded', async () => {
    // Theme toggle
    const themeBtn = $('#themeToggle');
    if (themeBtn) on(themeBtn, 'click', () => { const mode = Theme.toggle(); themeBtn.setAttribute('aria-pressed', String(mode === 'light')); });

    // Apply persisted filter labels and enable editing
    applyFilterLabels();
    enableFilterLabelEditing();

    // Filter chips
    $$('.filter-group .chip').forEach(chip => {
      on(chip, 'click', () => {
        $$('.filter-group .chip').forEach(c => { c.classList.remove('is-active'); c.setAttribute('aria-pressed', 'false'); });
        chip.classList.add('is-active');
        chip.setAttribute('aria-pressed', 'true');
        Grid.filter(chip.dataset.filter);
      });
    });

    // Layout chips
    $$('.layout-group .chip').forEach(chip => {
      on(chip, 'click', () => {
        $$('.layout-group .chip').forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        Grid.setCols(Number(chip.dataset.cols));
      });
    });

    const gridEl = Grid.grid;

    // Remove default cards that were deleted previously
    $$('.card', gridEl).forEach(card => {
      const img = $('img', card);
      if (!img) return;
      const key = img.getAttribute('src');
      if (key && DefaultDeletes.has(key)) card.remove();
    });

    // Load persisted uploads and render them at the top
    try {
      const saved = await DB.getAll();
      saved.sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
      saved.forEach(item => {
        const card = buildCard(item);
        gridEl.insertBefore(card, gridEl.firstChild);
        attachCardOpen(card);
        attachCaptionEditing(card);
      });
    } catch {}

    // Attach to any remaining initial cards
    $$('.card', gridEl).forEach(card => { attachCardOpen(card); /* captions for defaults remain static */ });

    // Upload handling with category prompt
    const uploadBtn = $('#uploadBtn');
    const uploadInput = $('#uploadInput');

    async function fileToDataURL(file) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); }); }

    if (uploadBtn && uploadInput) {
      on(uploadBtn, 'click', () => uploadInput.click());
      on(uploadInput, 'change', async () => {
        const files = Array.from(uploadInput.files || []);
        if (!files.length) return;
        const tag = promptForCategory();
        for (const file of files) {
          if (!file.type.startsWith('image/')) continue;
          try {
            const dataURL = await fileToDataURL(file);
            const id = uid();
            const alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
            const item = { id, src: dataURL, alt, captionText: 'New memory — ' + (alt || 'us'), tag, createdAt: Date.now() };
            await DB.put(item);
            const card = buildCard(item);
            gridEl.insertBefore(card, gridEl.firstChild);
            attachCardOpen(card);
            attachCaptionEditing(card);
          } catch {}
        }
        uploadInput.value = '';
      });
    }

    // Delete handling (delegation)
    on(gridEl, 'click', async (e) => {
      const btn = e.target.closest('.action-delete');
      if (!btn) return;
      e.stopPropagation();
      const card = btn.closest('.card');
      if (!card) return;
      const id = card.dataset.id;
      if (id) {
        try { await DB.remove(id); } catch {}
        card.remove();
      } else {
        const img = $('img', card);
        const key = img?.getAttribute('src');
        if (key) DefaultDeletes.add(key);
        card.remove();
      }
    });
  });
})();
