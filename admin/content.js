(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  function escapeHTML(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function api(path, options = {}) {
    const res = await fetch(path, { credentials: 'include', ...options });
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : null;
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function setStatus(form, msg, type) {
    const el = form.querySelector('[data-status]');
    if (!el) return;
    el.textContent = '// ' + msg;
    el.className = 'form-status' + (type ? ' ' + type : '');
    if (type === 'success') setTimeout(() => (el.textContent = ''), 2500);
  }

  /* ========== Tabs ========== */
  function bindTabs() {
    const tabs = $$('.content-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        $$('.content-panel').forEach((p) => {
          const on = p.dataset.panel === tab.dataset.tab;
          p.hidden = !on;
          p.classList.toggle('active', on);
        });
      });
    });
  }

  /* ========== Simple key-value form (profile, hero, about, experienceBanner) ========== */
  function fillForm(form, data) {
    if (!form || !data) return;
    Object.entries(data).forEach(([key, val]) => {
      const input = form.querySelector(`[name="${key}"]`);
      if (!input) return;
      if (input.type === 'checkbox') input.checked = !!val;
      else input.value = val == null ? '' : val;
    });
  }

  function formToObject(form) {
    const fd = new FormData(form);
    const obj = {};
    fd.forEach((v, k) => { obj[k] = v; });
    form.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      obj[cb.name] = cb.checked;
    });
    form.querySelectorAll('input[type="number"]').forEach((inp) => {
      if (obj[inp.name] === '' || obj[inp.name] === undefined) return;
      const n = Number(obj[inp.name]);
      if (!Number.isNaN(n)) obj[inp.name] = n;
    });
    return obj;
  }

  async function bindObjectForm(section) {
    const form = $(`#${section}Form`);
    if (!form) return;
    const data = await api('/api/content').then((c) => c[section]).catch(() => null);
    if (data) fillForm(form, data);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const value = formToObject(form);
      try {
        await api(`/api/content/${section}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value })
        });
        setStatus(form, 'Saved successfully.', 'success');
      } catch (err) {
        setStatus(form, err.message, 'error');
      }
    });
  }

  /* ========== Hero stats repeater ========== */
  function renderStat(row = { label: '', value: 0 }) {
    const el = document.createElement('div');
    el.className = 'repeater__row';
    el.innerHTML = `
      <div class="row-inner">
        <input placeholder="Label (e.g. Years experience)" value="${escapeHTML(row.label)}" data-key="label" />
        <input placeholder="Value" value="${escapeHTML(row.value)}" data-key="value" />
        <button type="button" class="repeater__remove">✕</button>
      </div>
    `;
    el.querySelector('.repeater__remove').addEventListener('click', () => el.remove());
    return el;
  }

  async function bindHero() {
    const form = $('#heroForm');
    if (!form) return;
    const statsWrap = $('#heroStats');
    const hero = await api('/api/content').then((c) => c.hero).catch(() => null);
    if (hero) fillForm(form, hero);
    (hero && Array.isArray(hero.stats) ? hero.stats : []).forEach((s) => statsWrap.appendChild(renderStat(s)));

    $('[data-add-stat]').addEventListener('click', () => statsWrap.appendChild(renderStat()));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const base = formToObject(form);
      const stats = $$('.repeater__row', statsWrap).map((row) => {
        const label = row.querySelector('[data-key="label"]').value.trim();
        const rawVal = row.querySelector('[data-key="value"]').value.trim();
        const value = /^\d+(\.\d+)?$/.test(rawVal) ? Number(rawVal) : rawVal;
        return { label, value };
      }).filter((s) => s.label);
      base.stats = stats;
      try {
        await api('/api/content/hero', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: base })
        });
        setStatus(form, 'Hero saved.', 'success');
      } catch (err) {
        setStatus(form, err.message, 'error');
      }
    });
  }

  /* ========== About (paragraphs + specialties) ========== */
  function renderTextareaRow(value = '') {
    const el = document.createElement('div');
    el.className = 'repeater__row';
    el.innerHTML = `
      <textarea rows="3" style="flex:1 1 auto;">${escapeHTML(value)}</textarea>
      <button type="button" class="repeater__remove">✕</button>
    `;
    el.querySelector('.repeater__remove').addEventListener('click', () => el.remove());
    return el;
  }
  function renderInputRow(value = '') {
    const el = document.createElement('div');
    el.className = 'repeater__row';
    el.innerHTML = `
      <input value="${escapeHTML(value)}" style="flex:1 1 auto;" />
      <button type="button" class="repeater__remove">✕</button>
    `;
    el.querySelector('.repeater__remove').addEventListener('click', () => el.remove());
    return el;
  }

  async function bindAbout() {
    const form = $('#aboutForm');
    if (!form) return;
    const pWrap = $('#aboutParagraphs');
    const sWrap = $('#aboutSpecialties');
    const about = await api('/api/content').then((c) => c.about).catch(() => null);
    (about && Array.isArray(about.paragraphs) ? about.paragraphs : ['']).forEach((p) => pWrap.appendChild(renderTextareaRow(p)));
    (about && Array.isArray(about.specialties) ? about.specialties : ['']).forEach((s) => sWrap.appendChild(renderInputRow(s)));

    $('[data-add-paragraph]').addEventListener('click', () => pWrap.appendChild(renderTextareaRow()));
    $('[data-add-specialty]').addEventListener('click', () => sWrap.appendChild(renderInputRow()));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const paragraphs = $$('textarea', pWrap).map((t) => t.value.trim()).filter(Boolean);
      const specialties = $$('input', sWrap).map((i) => i.value.trim()).filter(Boolean);
      try {
        await api('/api/content/about', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: { paragraphs, specialties } })
        });
        setStatus(form, 'About saved.', 'success');
      } catch (err) {
        setStatus(form, err.message, 'error');
      }
    });
  }

  /* ========== Generic list (skills, experience, projects, education, references, languages, interests) ========== */
  const listSchemas = {
    skills: {
      form: 'skillForm',
      fields: ['title', 'items'],
      transformOut: (data) => ({
        ...data,
        items: String(data.items || '').split(',').map((s) => s.trim()).filter(Boolean)
      }),
      transformIn: (data) => ({
        ...data,
        items: Array.isArray(data.items) ? data.items.join(', ') : data.items || ''
      }),
      render: (item) => `
        <span class="list-item__title">${escapeHTML(item.title)}</span>
        <div class="list-item__meta">
          ${(item.items || []).map((i) => `<span class="list-item__tag">${escapeHTML(i)}</span>`).join('')}
        </div>`
    },
    experience: {
      form: 'experienceForm',
      fields: ['date', 'company', 'role', 'description', 'tags'],
      transformOut: (data) => ({
        ...data,
        tags: String(data.tags || '').split(',').map((s) => s.trim()).filter(Boolean)
      }),
      transformIn: (data) => ({
        ...data,
        tags: Array.isArray(data.tags) ? data.tags.join(', ') : data.tags || ''
      }),
      render: (item) => `
        <span class="list-item__title">${escapeHTML(item.role)} · ${escapeHTML(item.company)}</span>
        <span class="list-item__sub">${escapeHTML(item.date)}</span>
        <div class="list-item__meta">
          ${(item.tags || []).map((t) => `<span class="list-item__tag">${escapeHTML(t)}</span>`).join('')}
        </div>`
    },
    projects: {
      form: 'projectForm',
      fields: ['code', 'badge', 'status', 'statusType', 'title', 'description', 'stack', 'metrics'],
      transformOut: (data) => {
        let metrics;
        if (data.metrics) {
          try { metrics = JSON.parse(data.metrics); } catch (e) { metrics = undefined; }
        }
        return {
          ...data,
          stack: String(data.stack || '').split(',').map((s) => s.trim()).filter(Boolean),
          metrics: metrics
        };
      },
      transformIn: (data) => ({
        ...data,
        stack: Array.isArray(data.stack) ? data.stack.join(', ') : data.stack || '',
        metrics: Array.isArray(data.metrics) ? JSON.stringify(data.metrics, null, 2) : (data.metrics || '')
      }),
      render: (item) => `
        <span class="list-item__title">${escapeHTML(item.title)}</span>
        <span class="list-item__sub">${escapeHTML(item.code || '')} · ${escapeHTML(item.status || '')}</span>
        <div class="list-item__meta">
          ${(item.stack || []).map((s) => `<span class="list-item__tag">${escapeHTML(s)}</span>`).join('')}
        </div>`
    },
    education: {
      form: 'educationForm',
      fields: ['title', 'institution'],
      render: (item) => `
        <span class="list-item__title">${escapeHTML(item.title)}</span>
        <span class="list-item__sub">${escapeHTML(item.institution)}</span>`
    },
    references: {
      form: 'referenceForm',
      fields: ['name', 'role', 'phone'],
      render: (item) => `
        <span class="list-item__title">${escapeHTML(item.name)}</span>
        <span class="list-item__sub">${escapeHTML(item.role || '')}</span>
        <span class="list-item__sub">${escapeHTML(item.phone || '')}</span>`
    },
    languages: {
      form: 'languageForm',
      fields: ['name', 'level', 'percent'],
      transformOut: (data) => ({ ...data, percent: Number(data.percent) || 0 }),
      render: (item) => `
        <span class="list-item__title">${escapeHTML(item.name)} — ${escapeHTML(item.level)}</span>
        <span class="list-item__sub">${escapeHTML(item.percent)}%</span>`
    },
    interests: {
      form: 'interestForm',
      fields: ['title', 'detail'],
      render: (item) => `
        <span class="list-item__title">${escapeHTML(item.title)}</span>
        <span class="list-item__sub">${escapeHTML(item.detail || '')}</span>`
    },
    music: {
      form: 'musicForm',
      fields: ['title', 'youtubeUrl', 'role', 'year', 'description', 'featured'],
      transformOut: (data) => ({
        ...data,
        featured: !!data.featured,
        youtubeId: extractYouTubeId(data.youtubeUrl)
      }),
      render: (item) => {
        const vid = item.youtubeId || extractYouTubeId(item.youtubeUrl);
        const thumb = vid ? `https://img.youtube.com/vi/${vid}/mqdefault.jpg` : '';
        return `
        <div class="music-admin-row">
          ${thumb ? `<img class="music-admin-thumb" src="${escapeHTML(thumb)}" alt="" loading="lazy" />` : '<div class="music-admin-thumb music-admin-thumb--empty">?</div>'}
          <div class="music-admin-info">
            <span class="list-item__title">${escapeHTML(item.title)}${item.featured ? ' <span class="pill pill--green" style="margin-left:0.4rem;font-size:0.65rem;">featured</span>' : ''}</span>
            <span class="list-item__sub">${escapeHTML(item.role || '')}${item.role && item.year ? ' · ' : ''}${escapeHTML(item.year || '')}</span>
            ${item.description ? `<span class="list-item__sub" style="opacity:0.7;">${escapeHTML(item.description)}</span>` : ''}
          </div>
        </div>`;
      }
    }
  };

  // Extract the 11-char YouTube video ID from any common URL format.
  // Supports: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID,
  // youtube.com/shorts/ID, and a bare 11-char ID string.
  function extractYouTubeId(input) {
    if (!input) return '';
    const s = String(input).trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
    const m = s.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  async function bindListSection(section) {
    const schema = listSchemas[section];
    const form = $(`#${schema.form}`);
    if (!form) return;
    const panel = form.closest('.content-panel');
    const listEl = panel.querySelector('[data-list]');
    const countEl = panel.querySelector('[data-count]');
    const cancelBtn = panel.querySelector('[data-cancel-edit]');

    function resetForm() {
      form.reset();
      form.querySelector('input[name="id"]').value = '';
      cancelBtn.hidden = true;
    }

    async function refresh() {
      const data = await api('/api/content').then((c) => c[section]).catch(() => []);
      const items = Array.isArray(data) ? data : [];
      countEl.textContent = items.length;
      countEl.className = 'pill' + (items.length ? ' pill--green' : '');

      listEl.innerHTML = items.length
        ? items.map((item) => `
          <div class="list-item" data-id="${escapeHTML(item.id)}">
            <div class="list-item__main">${schema.render(item)}</div>
            <div class="list-item__actions">
              <button class="btn btn--ghost btn--sm" data-edit>Edit</button>
              <button class="btn btn--danger btn--sm" data-delete>Delete</button>
            </div>
          </div>`).join('')
        : '<p class="muted">Nothing here yet — add your first entry above.</p>';

      listEl.querySelectorAll('[data-edit]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.closest('.list-item').dataset.id;
          const it = items.find((x) => x.id === id);
          if (!it) return;
          const filled = schema.transformIn ? schema.transformIn(it) : it;
          fillForm(form, { id: it.id, ...filled });
          cancelBtn.hidden = false;
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
      listEl.querySelectorAll('[data-delete]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.closest('.list-item').dataset.id;
          if (!confirm('Delete this item?')) return;
          try {
            await api(`/api/content/${section}/item/${encodeURIComponent(id)}`, { method: 'DELETE' });
            resetForm();
            await refresh();
          } catch (err) {
            alert(err.message);
          }
        });
      });
    }

    cancelBtn.addEventListener('click', resetForm);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const raw = formToObject(form);
      const out = schema.transformOut ? schema.transformOut(raw) : raw;
      if (!out.id) delete out.id;
      try {
        await api(`/api/content/${section}/item`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(out)
        });
        setStatus(form, 'Saved.', 'success');
        resetForm();
        await refresh();
      } catch (err) {
        setStatus(form, err.message, 'error');
      }
    });

    await refresh();
  }

  async function ensureLoggedIn() {
    try {
      await api('/api/auth/me');
    } catch (err) {
      if (err.status === 401) window.location.href = '/admin';
    }
  }

  function bindLogout() {
    const btn = $('#logoutBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      try { await api('/api/auth/logout', { method: 'POST' }); } catch (_) {}
      window.location.href = '/admin';
    });
  }

  /* ========== Profile photo upload ========== */
  async function bindPhotoUpload() {
    const form = $('#photoForm');
    const input = $('#photoInput');
    const preview = $('#profilePhotoPreview');
    const removeBtn = $('#photoRemove');
    if (!form || !input || !preview) return;

    async function refreshPreview() {
      const content = await api('/api/content').catch(() => null);
      const url = content && content.profile && content.profile.photoUrl;
      preview.src = (url || '/assets/profile.png') + '?v=' + Date.now();
    }
    await refreshPreview();

    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        setStatus(form, 'Image must be under 5 MB.', 'error');
        return;
      }
      const localUrl = URL.createObjectURL(file);
      preview.src = localUrl;

      const fd = new FormData();
      fd.append('photo', file);
      try {
        setStatus(form, 'Uploading...', '');
        const res = await fetch('/api/content/profile/photo', {
          method: 'POST',
          credentials: 'include',
          body: fd
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        setStatus(form, 'Photo updated. Refresh public site to see it.', 'success');
        preview.src = data.photoUrl + '?v=' + Date.now();
        input.value = '';
      } catch (err) {
        setStatus(form, err.message, 'error');
        await refreshPreview();
      }
    });

    removeBtn.addEventListener('click', async () => {
      if (!confirm('Reset profile photo to the default?')) return;
      try {
        await api('/api/content/profile/photo', { method: 'DELETE' });
        setStatus(form, 'Photo reset to default.', 'success');
        await refreshPreview();
      } catch (err) {
        setStatus(form, err.message, 'error');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await ensureLoggedIn();
    bindTabs();
    bindLogout();

    await Promise.all([
      bindPhotoUpload(),
      bindObjectForm('profile'),
      bindHero(),
      bindAbout(),
      bindObjectForm('experienceBanner'),
      bindListSection('skills'),
      bindListSection('experience'),
      bindListSection('projects'),
      bindListSection('education'),
      bindListSection('references'),
      bindListSection('languages'),
      bindListSection('interests'),
      bindListSection('music')
    ]);
  });
})();
