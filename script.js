/* ==========================================
   QA Portfolio — script.js
   Handles: typewriter, counters, canvas bugs,
   scroll reveal, form, nav toggle
   ========================================== */

(() => {
  'use strict';

  /* ---------- Typewriter effect ---------- */
  const typeTarget = document.getElementById('typewriter');
  const typewriterText =
    "Hunting bugs across manual, automated, API, and load tests — shipping software that survives real users. Based in Kandy, Sri Lanka.";

  if (typeTarget) {
    let i = 0;
    const speed = 28;
    (function typeChar() {
      if (i < typewriterText.length) {
        typeTarget.textContent += typewriterText.charAt(i);
        i++;
        setTimeout(typeChar, speed + Math.random() * 40);
      }
    })();
  }

  /* ---------- Animated counters ---------- */
  const counterObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = parseFloat(el.dataset.count);
        if (Number.isNaN(target)) { counterObserver.unobserve(el); return; }
        const isFloat = target % 1 !== 0;
        const duration = 1800;
        const start = performance.now();

        function tick(now) {
          const p = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          const value = target * eased;
          el.textContent = isFloat ? value.toFixed(1) : Math.floor(value).toLocaleString();
          if (p < 1) requestAnimationFrame(tick);
          else el.textContent = isFloat ? target.toFixed(1) : target.toLocaleString();
        }
        requestAnimationFrame(tick);
        counterObserver.unobserve(el);
      });
    },
    { threshold: 0.4 }
  );
  function observeCounters(root = document) {
    root.querySelectorAll('[data-count]').forEach((c) => counterObserver.observe(c));
  }
  observeCounters();

  /* ---------- Scroll reveal ---------- */
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('visible'), index * 40);
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  function observeReveal(root = document) {
    root.querySelectorAll('.section, .skill-card, .project, .timeline__item, .dashboard__panel, .cert').forEach((el) => {
      if (!el.classList.contains('reveal')) el.classList.add('reveal');
      revealObserver.observe(el);
    });
  }
  observeReveal();

  /* ---------- Nav mobile toggle ---------- */
  const navToggle = document.querySelector('.nav__toggle');
  const navLinks = document.querySelector('.nav__links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
    navLinks.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') navLinks.classList.remove('open');
    });
  }

  /* ---------- Contact form (Web3Forms — AJAX with proper CORS) ---------- */
  const form = document.getElementById('contactForm');
  const status = document.getElementById('formStatus');
  if (form && status) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const data = Object.fromEntries(new FormData(form).entries());
      if (!data.name || !data.email || !data.message) {
        status.textContent = '// Error: please fill out all required fields';
        status.className = 'form-status error';
        return;
      }

      if (data.access_key === 'YOUR_ACCESS_KEY_HERE' || !data.access_key) {
        status.textContent =
          '// Error: form not configured yet. Get an access key from web3forms.com and update index.html';
        status.className = 'form-status error';
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalBtnHTML = submitBtn ? submitBtn.innerHTML : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Sending...';
      }
      status.textContent = '// Sending message...';
      status.className = 'form-status';

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data)
        });
        const result = await response.json().catch(() => ({}));

        if (response.ok && result.success) {
          status.textContent = "// Message sent! I'll get back to you as soon as I can.";
          status.className = 'form-status success';
          form.reset();
        } else {
          status.textContent = '// Error: ' + (result.message || 'submission failed. Please try again.');
          status.className = 'form-status error';
        }
      } catch (err) {
        status.textContent =
          '// Network error — please try again or email me directly at mahendraetampawala98@gmail.com';
        status.className = 'form-status error';
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnHTML;
        }
      }
    });
  }

  /* ---------- Load CV + Certifications + Content from backend (if available) ---------- */
  (async function loadDynamicContent() {
    const downloadBtn = document.getElementById('downloadCvBtn');
    const certsSection = document.getElementById('certifications');
    const certsList = document.getElementById('certsList');
    const refsNumber = document.getElementById('refsNumber');
    const contactNumber = document.getElementById('contactNumber');

    function escapeHTML(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function setText(selector, value) {
      const el = document.querySelector(selector);
      if (el && value != null && value !== '') el.textContent = value;
    }
    function setHTML(selector, value) {
      const el = document.querySelector(selector);
      if (el && value != null && value !== '') el.innerHTML = value;
    }
    function setAttr(selector, attr, value) {
      const el = document.querySelector(selector);
      if (el && value != null && value !== '') el.setAttribute(attr, value);
    }

    async function loadContent() {
      try {
        return await fetch('/api/content').then((r) => (r.ok ? r.json() : null));
      } catch (_) {
        return null;
      }
    }

    const content = await loadContent();
    if (content) hydrateContent(content);

    function hydrateContent(c) {
      // ----- Page meta -----
      if (c.profile && c.profile.name) {
        document.title = `${c.profile.name} — QA Engineer Portfolio`;
      }

      // ----- Nav logo -----
      if (c.profile && c.profile.handle) {
        const handleName = c.profile.handle.replace(/^@/, '');
        setText('.nav__logo-name', handleName);
      }

      // ----- Hero -----
      if (c.hero) {
        setText('.hero__tag', c.hero.tag);
        const titleEl = document.querySelector('.hero__title');
        if (titleEl && (c.hero.headlineLead || c.hero.headlineAccent || c.hero.headlineTail)) {
          titleEl.innerHTML = `
            ${escapeHTML(c.hero.headlineLead || '')} <span class="gradient-text">${escapeHTML(c.hero.headlineAccent || '')}</span><br />
            ${escapeHTML(c.hero.headlineTail || '')}
          `;
        }
        const descEl = document.querySelector('.hero__desc');
        if (descEl && c.hero.description) descEl.textContent = c.hero.description;

        if (Array.isArray(c.hero.stats)) {
          const statsWrap = document.querySelector('.hero__stats');
          if (statsWrap) {
            statsWrap.innerHTML = c.hero.stats.map((s) => `
              <div class="hero__stat">
                <strong data-count="${escapeHTML(s.value)}">0</strong>
                <span>${escapeHTML(s.label)}</span>
              </div>
            `).join('');
          }
        }
      }

      // ----- Terminal readout (whoami output) -----
      if (c.profile) {
        const outEl = document.querySelector('.hero__portrait-terminal .output');
        if (outEl) {
          const nameSlug = (c.profile.name || '').toLowerCase().replace(/\s+/g, '_');
          const roleSlug = (c.profile.role || '').toLowerCase().replace(/\s+/g, '_');
          outEl.textContent = `${nameSlug} :: ${roleSlug}`;
        }
      }

      // ----- Hero portrait (photo + info) -----
      if (c.profile) {
        const photoImg = document.getElementById('heroProfileImg');
        if (photoImg && c.profile.photoUrl) {
          photoImg.src = c.profile.photoUrl + '?v=' + Date.now();
        }
        setText('#heroProfileName', c.profile.name);
        setText('#heroProfileHandle', c.profile.handle);
        setText('#heroProfileCaption', c.profile.profileCaption);
        setText('#heroProfileRole', c.profile.role);
        // Shortened location for footer strip (e.g. "Kandy, LK")
        if (c.profile.location) {
          const short = c.profile.location
            .replace(/Sri Lanka/i, 'LK')
            .replace(/United States/i, 'US');
          setText('#heroProfileLoc', short);
        }
        // Short experience label (e.g. "4y 5m")
        if (c.profile.experienceLabel) {
          const short = c.profile.experienceLabel
            .replace(/\byears?\b/i, 'y')
            .replace(/\bmonths?\b/i, 'm')
            .replace(/\s+/g, ' ')
            .trim();
          setText('#heroProfileXp', short);
        }
      }

      // ----- About paragraphs -----
      if (c.about && Array.isArray(c.about.paragraphs)) {
        const aboutText = document.querySelector('.about__text');
        if (aboutText) {
          const oldPs = aboutText.querySelectorAll(':scope > p');
          oldPs.forEach((p) => p.remove());
          c.about.paragraphs.forEach((para) => {
            const p = document.createElement('p');
            p.textContent = para;
            aboutText.appendChild(p);
          });
        }
      }

      // ----- About JSON card -----
      if (c.profile || c.about) {
        const codeEl = document.querySelector('.about__code code');
        if (codeEl) {
          const specialties = (c.about && c.about.specialties) || [];
          codeEl.innerHTML = `<span class="c-key">{
  </span><span class="c-key">"role"</span>: <span class="c-str">"${escapeHTML(c.profile.role)}"</span>,
  <span class="c-key">"location"</span>: <span class="c-str">"${escapeHTML(c.profile.location)}"</span>,
  <span class="c-key">"experience"</span>: <span class="c-str">"${escapeHTML(c.profile.experienceLabel)}"</span>,
  <span class="c-key">"specialties"</span>: [
    ${specialties.map((s) => `<span class="c-str">"${escapeHTML(s)}"</span>`).join(',\n    ')}
  ],
  <span class="c-key">"currently_working_at"</span>: <span class="c-str">"${escapeHTML(c.profile.currentlyAt || (c.experienceBanner && c.experienceBanner.currentlyAt) || '')}"</span>,
  <span class="c-key">"open_to_work"</span>: <span class="c-bool">${c.profile.openToWork ? 'true' : 'false'}</span>
<span class="c-key">}</span>`;
        }
      }

      // ----- Experience banner -----
      if (c.experienceBanner) {
        const b = c.experienceBanner;
        const bannerYr = document.querySelector('.exp-banner__number:not(.exp-banner__number--sm)');
        const bannerMo = document.querySelector('.exp-banner__number--sm');
        if (bannerYr) bannerYr.setAttribute('data-count', b.years);
        if (bannerMo) bannerMo.setAttribute('data-count', b.months);
        const details = document.querySelectorAll('.exp-banner__details > div');
        if (details.length >= 3) {
          if (b.since) details[0].innerHTML = `<span>Since</span><strong>${escapeHTML(b.since)}</strong>`;
          if (b.rolesHeld != null) details[1].innerHTML = `<span>Roles held</span><strong>${escapeHTML(b.rolesHeld)}</strong>`;
          if (b.currentlyAt) details[2].innerHTML = `<span>Currently at</span><strong>${escapeHTML(b.currentlyAt)}</strong>`;
          if (details[3] && b.status) {
            details[3].innerHTML = `<span>Status</span><strong class="exp-banner__status"><span class="status-dot"></span>${escapeHTML(b.status)}</strong>`;
          }
        }
      }

      // ----- Skills -----
      if (Array.isArray(c.skills) && c.skills.length) {
        const skillsWrap = document.querySelector('.skills');
        if (skillsWrap) {
          skillsWrap.innerHTML = c.skills.map((s) => `
            <article class="skill-card">
              <div class="skill-card__icon">
                <svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              </div>
              <h3>${escapeHTML(s.title)}</h3>
              <ul>${(s.items || []).map((i) => `<li>${escapeHTML(i)}</li>`).join('')}</ul>
            </article>
          `).join('');
        }
      }

      // ----- Experience timeline -----
      if (Array.isArray(c.experience) && c.experience.length) {
        const timeline = document.querySelector('.timeline');
        if (timeline) {
          timeline.innerHTML = c.experience.map((e) => `
            <div class="timeline__item">
              <div class="timeline__dot"></div>
              <div class="timeline__content">
                <div class="timeline__meta">
                  <span class="timeline__date">${escapeHTML(e.date)}</span>
                  <span class="timeline__company">${escapeHTML(e.company)}</span>
                </div>
                <h3>${escapeHTML(e.role)}</h3>
                <p>${escapeHTML(e.description)}</p>
                <ul class="timeline__tags">
                  ${(e.tags || []).map((t) => `<li>${escapeHTML(t)}</li>`).join('')}
                </ul>
              </div>
            </div>
          `).join('');
        }
      }

      // ----- Projects -----
      if (Array.isArray(c.projects) && c.projects.length) {
        const projectsWrap = document.querySelector('.projects');
        if (projectsWrap) {
          projectsWrap.innerHTML = c.projects.map((p) => {
            const badgeHtml = p.badge
              ? `<div class="project__badge${p.badge === 'Developed' ? ' project__badge--oss' : ''}">${escapeHTML(p.badge)}</div>`
              : '';
            const metricsHtml = Array.isArray(p.metrics) && p.metrics.length
              ? `<div class="project__metrics">${p.metrics.map((m) => `<div><strong>${escapeHTML(m.value)}</strong><span>${escapeHTML(m.label)}</span></div>`).join('')}</div>`
              : '';
            const statusCls = p.statusType === 'open' ? 'project__status--open' : 'project__status--closed';
            return `
              <article class="project">
                ${badgeHtml}
                <div class="project__header">
                  <span class="project__id">${escapeHTML(p.code || '')}</span>
                  <span class="project__status ${statusCls}">${escapeHTML(p.status || '')}</span>
                </div>
                <h3>${escapeHTML(p.title)}</h3>
                <p class="project__summary">${escapeHTML(p.description)}</p>
                ${metricsHtml}
                <div class="project__stack">
                  ${(p.stack || []).map((s) => `<span>${escapeHTML(s)}</span>`).join('')}
                </div>
              </article>
            `;
          }).join('');
        }
      }

      // ----- Beyond QA: Languages + Interests -----
      if (Array.isArray(c.languages) && c.languages.length) {
        const bars = document.querySelector('#beyond .dashboard__panel:nth-child(1) .bars');
        if (bars) {
          const colors = ['#5cc8ff', '#7aff9c', '#c48bff', '#ffb455'];
          bars.innerHTML = c.languages.map((l, i) => `
            <div class="bar-row"><span>${escapeHTML(l.name)}</span><div class="bar"><div class="bar__fill" style="--w:${l.percent}%; --c:${colors[i % colors.length]}"></div></div><em>${escapeHTML(l.level)}</em></div>
          `).join('');
        }
      }
      if (Array.isArray(c.interests) && c.interests.length) {
        const list = document.querySelector('#beyond .cert-list');
        if (list) {
          list.innerHTML = c.interests.map((i) => `
            <li><strong>${escapeHTML(i.title)}</strong>${i.detail ? ' · ' + escapeHTML(i.detail) : ''}</li>
          `).join('');
        }
      }

      // ----- Education -----
      if (Array.isArray(c.education) && c.education.length) {
        const edu = document.querySelector('#education .certs');
        if (edu) {
          edu.innerHTML = c.education.map((e) => `
            <div class="cert">
              <strong>${escapeHTML(e.title)}</strong>
              <span>${escapeHTML(e.institution)}</span>
            </div>
          `).join('');
        }
      }

      // ----- References -----
      if (Array.isArray(c.references) && c.references.length) {
        const refs = document.querySelector('#references .certs');
        if (refs) {
          refs.innerHTML = c.references.map((r) => `
            <div class="cert">
              <strong>${escapeHTML(r.name)}</strong>
              ${r.role ? `<span>${escapeHTML(r.role)}</span>` : ''}
              ${r.phone ? `<span>${escapeHTML(r.phone)}</span>` : ''}
            </div>
          `).join('');
        }
      }

      // ----- Contact -----
      if (c.profile) {
        const contactLinks = document.querySelectorAll('.contact__links .contact__link');
        if (contactLinks.length >= 4 && c.profile.email) {
          contactLinks[0].setAttribute('href', `mailto:${c.profile.email}`);
          contactLinks[0].innerHTML = `<span class="prompt">$</span> mail ${escapeHTML(c.profile.email)}`;
        }
        if (contactLinks.length >= 4 && c.profile.phone) {
          contactLinks[1].setAttribute('href', `tel:${c.profile.phone}`);
          const phoneDisplay = c.profile.phone.replace(/^\+?/, '+').replace(/(\d{2})(\d{2})(\d{3})(\d{4})/, '$1 $2 $3 $4');
          contactLinks[1].innerHTML = `<span class="prompt">$</span> call ${escapeHTML(phoneDisplay)}`;
        }
        if (contactLinks.length >= 4 && c.profile.linkedin) {
          contactLinks[2].setAttribute('href', c.profile.linkedin);
          const linkedinShort = c.profile.linkedin.replace(/^https?:\/\//, '').replace(/\/$/, '');
          contactLinks[2].innerHTML = `<span class="prompt">$</span> open ${escapeHTML(linkedinShort)}`;
        }
        if (contactLinks.length >= 4 && c.profile.location) {
          contactLinks[3].innerHTML = `<span class="prompt">$</span> locate ${escapeHTML(c.profile.location)}`;
        }
      }

      // ----- Footer -----
      if (c.profile) {
        const footerYear = new Date().getFullYear();
        const footerMeta = document.querySelector('.footer__meta span:first-child');
        if (footerMeta) footerMeta.textContent = `© ${footerYear} ${c.profile.name}`;
        const footerLogo = document.querySelector('.footer__logo');
        if (footerLogo && c.profile.handle) {
          footerLogo.textContent = `${c.profile.handle.replace(/^@/, '')} {}`;
        }
      }

      // ----- Music -----
      renderMusic(Array.isArray(c.music) ? c.music : []);
      renumberSections();

      observeCounters();
      observeReveal();
    }

    /* ---------- Music section ---------- */
    // Extract the 11-char YouTube video ID from watch/embed/shorts/youtu.be URLs.
    function extractYouTubeId(input) {
      if (!input) return '';
      const s = String(input).trim();
      if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
      const m = s.match(/(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      return m ? m[1] : '';
    }

    // ---- Modal open/close (defined at module scope so any code path can
    //      call them, and they only look up DOM nodes once). ----
    function openMusicModal(data) {
      const modal = document.getElementById('musicModal');
      const player = document.getElementById('musicModalPlayer');
      const titleEl = document.getElementById('musicModalTitle');
      const metaEl = document.getElementById('musicModalMeta');
      if (!modal || !player || !titleEl || !metaEl) return;

      titleEl.textContent = data.title || 'Now playing';
      const bits = [];
      if (data.role) bits.push(escapeHTML(data.role));
      if (data.year) bits.push(escapeHTML(data.year));
      let meta = bits.join(' <span class="music-card__meta-sep">·</span> ');
      if (data.description) meta += (meta ? '<br>' : '') + escapeHTML(data.description).replace(/\n/g, '<br>');
      metaEl.innerHTML = meta;

      const origin = encodeURIComponent(window.location.origin);
      player.innerHTML = `<iframe
        src="https://www.youtube.com/embed/${encodeURIComponent(data.videoId)}?autoplay=1&rel=0&modestbranding=1&playsinline=1&origin=${origin}"
        title="${escapeHTML(data.title)}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen></iframe>`;

      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }

    function closeMusicModal() {
      const modal = document.getElementById('musicModal');
      const player = document.getElementById('musicModalPlayer');
      if (!modal) return;
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (player) player.innerHTML = '';
    }

    function renderMusic(list) {
      const section = document.getElementById('music');
      const grid = document.getElementById('musicGrid');
      if (!section || !grid) return;

      const tracks = (list || [])
        .map((t) => ({ ...t, videoId: t.youtubeId || extractYouTubeId(t.youtubeUrl) }))
        .filter((t) => t.videoId && t.title);

      if (tracks.length === 0) {
        section.hidden = true;
        grid.innerHTML = '';
        return;
      }

      // Featured tracks first, preserving original order otherwise.
      tracks.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));

      grid.innerHTML = tracks.map((t) => `
        <button type="button" class="music-card" role="listitem"
                data-video-id="${escapeHTML(t.videoId)}"
                data-title="${escapeHTML(t.title)}"
                data-role="${escapeHTML(t.role || '')}"
                data-year="${escapeHTML(t.year || '')}"
                data-description="${escapeHTML(t.description || '')}"
                aria-label="Play ${escapeHTML(t.title)}">
          <div class="music-card__thumb">
            <img src="https://img.youtube.com/vi/${encodeURIComponent(t.videoId)}/hqdefault.jpg"
                 alt="" loading="lazy"
                 onerror="this.onerror=null;this.src='https://img.youtube.com/vi/${encodeURIComponent(t.videoId)}/mqdefault.jpg';" />
            ${t.featured ? `<span class="music-card__featured">★ featured</span>` : ''}
            <span class="music-card__yt-badge">YouTube</span>
            <span class="music-card__play" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </span>
          </div>
          <div class="music-card__body">
            <span class="music-card__title">${escapeHTML(t.title)}</span>
            ${(t.role || t.year) ? `
              <span class="music-card__meta">
                ${t.role ? `<em>${escapeHTML(t.role)}</em>` : ''}
                ${t.role && t.year ? `<span class="music-card__meta-sep">·</span>` : ''}
                ${t.year ? escapeHTML(t.year) : ''}
              </span>` : ''}
            ${t.description ? `<span class="music-card__desc">${escapeHTML(t.description).replace(/\n/g, '<br>')}</span>` : ''}
          </div>
        </button>
      `).join('');

      // Attach a direct click handler to every card. This is more reliable
      // than event delegation because it doesn't depend on the parent grid
      // element being the same node across re-renders, and it works even
      // if some ancestor accidentally stops propagation.
      grid.querySelectorAll('.music-card').forEach((card) => {
        card.addEventListener('click', () => {
          openMusicModal({
            videoId: card.dataset.videoId,
            title: card.dataset.title,
            role: card.dataset.role,
            year: card.dataset.year,
            description: card.dataset.description
          });
        });
      });

      section.hidden = false;
      setupMusicModal();
    }

    let musicModalReady = false;
    function setupMusicModal() {
      const modal = document.getElementById('musicModal');
      if (!modal || musicModalReady) return;
      musicModalReady = true;

      // Close: works whether the user clicks the button, its SVG, or the
      // backdrop outside the panel.
      modal.addEventListener('click', (e) => {
        if (e.target.closest('#musicModalClose') || e.target === modal) {
          closeMusicModal();
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('is-open')) closeMusicModal();
      });
    }

    /* ---------- Section renumbering ---------- */
    // Walk sections in visual order and assign sequential numbers to the
    // visible ones. Keeps 01,02,03… clean whether music or certifications
    // are hidden.
    function renumberSections() {
      const order = ['about', 'skills', 'experience', 'projects', 'beyond',
        'music', 'education', 'certifications', 'references', 'contact'];
      let n = 1;
      order.forEach((id) => {
        const el = document.getElementById(id);
        if (!el || el.hidden) return;
        const num = el.querySelector('.section__number');
        if (num) num.textContent = String(n).padStart(2, '0');
        n++;
      });
    }

    try {
      const [cvRes, certRes] = await Promise.all([
        fetch('/api/files/cv').then((r) => (r.ok ? r.json() : { cv: null })),
        fetch('/api/files/certs').then((r) => (r.ok ? r.json() : { certifications: [] }))
      ]);

      if (downloadBtn && cvRes && cvRes.cv) {
        downloadBtn.hidden = false;
      }

      if (certsSection && certsList && certRes && Array.isArray(certRes.certifications) && certRes.certifications.length) {
        certsList.innerHTML = certRes.certifications
          .map((c) => `
            <div class="cert cert--downloadable">
              <strong>${escapeHTML(c.title)}</strong>
              ${c.issuer || c.year ? `<span>${escapeHTML(c.issuer)}${c.issuer && c.year ? ' · ' : ''}${escapeHTML(c.year)}</span>` : ''}
              <button type="button" class="cert__download"
                      data-cert-preview
                      data-url="${escapeHTML(c.url)}"
                      data-title="${escapeHTML(c.title)}"
                      data-issuer="${escapeHTML(c.issuer || '')}"
                      data-year="${escapeHTML(c.year || '')}"
                      data-mime="${escapeHTML(c.originalName || '')}">
                <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                Preview certificate
              </button>
            </div>
          `)
          .join('');
        certsSection.hidden = false;
        renumberSections();
        setupCertModal();
      }
    } catch (err) {
      // Backend not running — keep static site behavior. Silently ignore.
    }

    function setupCertModal() {
      const modal = document.getElementById('certModal');
      if (!modal) return;
      const body = document.getElementById('certModalBody');
      const titleEl = document.getElementById('certModalTitle');
      const metaEl = document.getElementById('certModalMeta');

      function openModal(data) {
        titleEl.textContent = data.title || 'Certification Preview';
        const bits = [];
        if (data.issuer) bits.push(escapeHTML(data.issuer));
        if (data.year) bits.push(escapeHTML(data.year));
        metaEl.innerHTML = bits.length ? bits.join(' · ') : '';

        const url = data.url;
        const isPdf = /\.pdf(\?|$)/i.test(url) || /pdf/i.test(data.mime || '');
        body.innerHTML = isPdf
          ? `<iframe src="${escapeHTML(url)}#toolbar=0&navpanes=0" title="${escapeHTML(data.title)}" oncontextmenu="return false;"></iframe>`
          : `<img src="${escapeHTML(url)}" alt="${escapeHTML(data.title)}" draggable="false" oncontextmenu="return false;" />`;

        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      }

      function closeModal() {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        body.innerHTML = '';
      }

      document.querySelectorAll('[data-cert-preview]').forEach((btn) => {
        btn.addEventListener('click', () => {
          openModal({
            url: btn.dataset.url,
            title: btn.dataset.title,
            issuer: btn.dataset.issuer,
            year: btn.dataset.year,
            mime: btn.dataset.mime
          });
        });
      });

      modal.querySelectorAll('[data-modal-close]').forEach((el) => {
        el.addEventListener('click', closeModal);
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
      });
    }
  })();

  /* ---------- Deploy time ---------- */
  const deployTime = document.getElementById('deployTime');
  if (deployTime) {
    const now = new Date();
    deployTime.textContent = now.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  }

  /* ---------- Floating bug canvas ---------- */
  const canvas = document.getElementById('bugCanvas');
  if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const ctx = canvas.getContext('2d');
  let width, height;
  const bugs = [];

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const colors = ['#7aff9c', '#5cc8ff', '#c48bff', '#ffb455'];

  class Bug {
    constructor() {
      this.reset(true);
    }
    reset(initial = false) {
      this.x = Math.random() * width;
      this.y = initial ? Math.random() * height : height + 20;
      this.size = 1 + Math.random() * 2.5;
      this.speedY = -(0.15 + Math.random() * 0.45);
      this.speedX = (Math.random() - 0.5) * 0.4;
      this.color = colors[Math.floor(Math.random() * colors.length)];
      this.opacity = 0.15 + Math.random() * 0.35;
      this.phase = Math.random() * Math.PI * 2;
    }
    update(t) {
      this.y += this.speedY;
      this.x += this.speedX + Math.sin(t / 800 + this.phase) * 0.3;
      if (this.y < -20) this.reset();
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.globalAlpha = this.opacity;
      ctx.shadowBlur = 10;
      ctx.shadowColor = this.color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  }

  const count = Math.min(60, Math.floor((width * height) / 30000));
  for (let i = 0; i < count; i++) bugs.push(new Bug());

  function animate(t) {
    ctx.clearRect(0, 0, width, height);
    bugs.forEach((b) => {
      b.update(t);
      b.draw();
    });
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
})();
