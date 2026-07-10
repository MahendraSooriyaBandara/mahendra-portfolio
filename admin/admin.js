(() => {
  'use strict';

  const isDashboard = document.body.classList.contains('dashboard-page');
  if (!isDashboard) return;

  const $ = (id) => document.getElementById(id);

  function formatBytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch (_) {
      return iso;
    }
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'include',
      ...options
    });
    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : null;
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function ensureLoggedIn() {
    try {
      const data = await api('/api/auth/me');
      const accountUser = $('accountUser');
      if (accountUser && data && data.user) {
        accountUser.textContent = data.user.username;
      }
    } catch (err) {
      if (err.status === 401) {
        window.location.href = '/admin';
      }
    }
  }

  function setStatus(el, msg, type) {
    el.textContent = '// ' + msg;
    el.className = 'form-status' + (type ? ' ' + type : '');
  }

  function bindFileName(inputId, labelId) {
    const input = $(inputId);
    const label = $(labelId);
    if (!input || !label) return;
    input.addEventListener('change', () => {
      label.textContent = input.files && input.files[0] ? input.files[0].name : 'No file chosen';
    });
  }

  async function loadCV() {
    const statusPill = $('cvStatus');
    const currentBox = $('cvCurrent');
    const deleteBtn = $('cvDeleteBtn');

    try {
      const { cv } = await api('/api/files/cv');
      if (!cv) {
        statusPill.textContent = 'No CV uploaded';
        statusPill.className = 'pill';
        currentBox.innerHTML = '<span class="muted">No CV uploaded yet.</span>';
        deleteBtn.hidden = true;
        return;
      }
      statusPill.textContent = 'Live';
      statusPill.className = 'pill pill--green';
      currentBox.innerHTML = `
        <div class="file-info">
          <div>
            <strong>${escapeHTML(cv.originalName)}</strong>
            <span class="muted">${formatBytes(cv.size)} · uploaded ${fmtDate(cv.uploadedAt)}</span>
          </div>
          <div class="row row--sm">
            <a class="btn btn--ghost btn--sm" href="${cv.url}" target="_blank" rel="noopener">Preview</a>
            <a class="btn btn--ghost btn--sm" href="/api/files/cv/download">Download</a>
          </div>
        </div>
      `;
      deleteBtn.hidden = false;
    } catch (err) {
      statusPill.textContent = 'Error';
      statusPill.className = 'pill pill--red';
      currentBox.innerHTML = `<span class="error">${escapeHTML(err.message)}</span>`;
    }
  }

  async function loadCerts() {
    const list = $('certList');
    const count = $('certCount');
    try {
      const { certifications } = await api('/api/files/certs');
      count.textContent = certifications.length;
      count.className = 'pill' + (certifications.length ? ' pill--green' : '');
      if (!certifications.length) {
        list.innerHTML = '<p class="muted">No certifications uploaded yet.</p>';
        return;
      }
      list.innerHTML = certifications
        .map(
          (c) => `
        <div class="cert-item" data-id="${c.id}">
          <div class="cert-item__main">
            <strong>${escapeHTML(c.title)}</strong>
            ${c.issuer ? `<span>${escapeHTML(c.issuer)}${c.year ? ' · ' + escapeHTML(c.year) : ''}</span>` : c.year ? `<span>${escapeHTML(c.year)}</span>` : ''}
            <em>${escapeHTML(c.originalName)} · ${formatBytes(c.size)}</em>
          </div>
          <div class="cert-item__actions">
            <a class="btn btn--ghost btn--sm" href="${c.url}" target="_blank" rel="noopener">View</a>
            <a class="btn btn--ghost btn--sm" href="/api/files/certs/${c.id}/download">Download</a>
            <button class="btn btn--danger btn--sm" data-action="delete" data-id="${c.id}">Delete</button>
          </div>
        </div>
      `
        )
        .join('');

      list.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this certification?')) return;
          try {
            await api(`/api/files/certs/${btn.dataset.id}`, { method: 'DELETE' });
            await loadCerts();
          } catch (err) {
            alert('Delete failed: ' + err.message);
          }
        });
      });
    } catch (err) {
      list.innerHTML = `<p class="error">Failed to load: ${escapeHTML(err.message)}</p>`;
    }
  }

  function escapeHTML(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function bindCVForm() {
    const form = $('cvForm');
    const status = $('cvStatusMsg');
    const deleteBtn = $('cvDeleteBtn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = $('cvFile').files[0];
      if (!file) return setStatus(status, 'Please choose a file first', 'error');

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Uploading...';
      setStatus(status, 'Uploading...');

      try {
        const fd = new FormData();
        fd.append('file', file);
        await api('/api/files/cv', { method: 'POST', body: fd });
        setStatus(status, 'CV uploaded successfully!', 'success');
        form.reset();
        $('cvFileName').textContent = 'No file chosen';
        await loadCV();
      } catch (err) {
        setStatus(status, err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Upload / Replace CV';
      }
    });

    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Delete the current CV? This cannot be undone.')) return;
      try {
        await api('/api/files/cv', { method: 'DELETE' });
        setStatus(status, 'CV deleted', 'success');
        await loadCV();
      } catch (err) {
        setStatus(status, err.message, 'error');
      }
    });
  }

  function bindCertForm() {
    const form = $('certForm');
    const status = $('certStatusMsg');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = $('certFile').files[0];
      const title = $('certTitle').value.trim();
      if (!title) return setStatus(status, 'Title is required', 'error');
      if (!file) return setStatus(status, 'Please choose a file', 'error');

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Uploading...';
      setStatus(status, 'Uploading...');

      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('title', title);
        fd.append('issuer', $('certIssuer').value.trim());
        fd.append('year', $('certYear').value.trim());
        await api('/api/files/certs', { method: 'POST', body: fd });
        setStatus(status, 'Certification uploaded!', 'success');
        form.reset();
        $('certFileName').textContent = 'No file chosen';
        await loadCerts();
      } catch (err) {
        setStatus(status, err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Upload Certification';
      }
    });
  }

  function bindLogout() {
    const btn = $('logoutBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      try {
        await api('/api/auth/logout', { method: 'POST' });
      } catch (_) {}
      window.location.href = '/admin';
    });
  }

  function bindPasswordForm() {
    const form = $('passwordForm');
    if (!form) return;
    const status = $('passwordStatusMsg');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = $('currentPassword').value;
      const newPassword = $('newPassword').value;
      const confirmPassword = $('confirmPassword').value;

      if (!currentPassword || !newPassword) {
        return setStatus(status, 'All fields are required', 'error');
      }
      if (newPassword.length < 6) {
        return setStatus(status, 'New password must be at least 6 characters', 'error');
      }
      if (newPassword !== confirmPassword) {
        return setStatus(status, 'New passwords do not match', 'error');
      }
      if (newPassword === currentPassword) {
        return setStatus(status, 'New password must differ from the current one', 'error');
      }

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Updating...';
      setStatus(status, 'Updating password...');

      try {
        const data = await api('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
        });
        setStatus(status, (data && data.message) || 'Password updated. Redirecting to login...', 'success');
        form.reset();
        setTimeout(() => (window.location.href = '/admin'), 1500);
      } catch (err) {
        setStatus(status, err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Update password';
      }
    });
  }

  function bindUsernameForm() {
    const form = $('usernameForm');
    if (!form) return;
    const status = $('usernameStatusMsg');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newUsername = $('newUsername').value.trim();
      const currentPassword = $('currentPasswordU').value;

      if (!newUsername || !currentPassword) {
        return setStatus(status, 'Both fields are required', 'error');
      }
      if (newUsername.length < 3) {
        return setStatus(status, 'Username must be at least 3 characters', 'error');
      }

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Updating...';
      setStatus(status, 'Updating username...');

      try {
        const data = await api('/api/auth/change-username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newUsername })
        });
        setStatus(status, (data && data.message) || 'Username updated. Redirecting to login...', 'success');
        form.reset();
        setTimeout(() => (window.location.href = '/admin'), 1500);
      } catch (err) {
        setStatus(status, err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Update username';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await ensureLoggedIn();
    bindFileName('cvFile', 'cvFileName');
    bindFileName('certFile', 'certFileName');
    bindCVForm();
    bindCertForm();
    bindLogout();
    bindPasswordForm();
    bindUsernameForm();
    await loadCV();
    await loadCerts();
  });
})();
