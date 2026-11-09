import { profile, projects, skills, experience, asset } from './data.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ext = (url) => (url && url !== '#' ? ' target="_blank" rel="noopener"' : '');

/** Project image, or a generated cover in the project colour when none is set. */
function cover(p) {
  if (p.image) return asset(p.image);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><defs><radialGradient id="g" cx=".3" cy=".3" r="1"><stop offset="0" stop-color="${p.color}" stop-opacity=".55"/><stop offset="1" stop-color="#05060a"/></radialGradient></defs><rect width="1600" height="1000" fill="url(#g)"/><text x="120" y="560" fill="#fff" font-family="sans-serif" font-size="120" font-weight="700">${esc(p.title)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ------------------------------------------------------------------ */
/* Panels                                                              */
/* ------------------------------------------------------------------ */

export function renderPanels({ onProjectHover, onProject }) {
  // Hero
  $('#hero-name').textContent = profile.name;
  $('#hero-role').textContent = profile.role;
  $('#hero-bio').textContent = profile.bio;

  // CPU
  $('#cpu-name').textContent = profile.name;
  $('#cpu-role').textContent = profile.role;
  $('#cpu-bio').textContent = profile.bio;
  $('#cpu-contact').innerHTML = `
    <li><span>E-mail</span><button class="copy" data-copy="${esc(profile.email)}">${esc(profile.email)}<i>copiar</i></button></li>
    <li><span>Local</span><b>${esc(profile.location)}</b></li>
    <li><span>Telefone</span><b>${esc(profile.phone)}</b></li>
    <li><span>Status</span><b class="status"><i></i>${esc(profile.availability)}</b></li>`;
  $('#cpu-specs').innerHTML = profile.specs.map(([k, v]) => `<li><span>${esc(k)}</span><b>${esc(v)}</b></li>`).join('');
  $('#cpu-links').innerHTML = profile.links.map((l) => `<a href="${esc(l.url)}"${ext(l.url)}>${esc(l.label)} ↗</a>`).join('');

  // RAM
  $('#ram-grid').innerHTML = projects
    .map(
      (p, i) => `
    <button class="proj" data-project="${i}" style="--c:${p.color}">
      <span class="thumb"><img src="${esc(cover(p))}" alt="" width="1600" height="1000" loading="lazy" decoding="async" /></span>
      <span class="slot mono">${esc(p.slot)} · ${esc(p.year)}</span>
      <strong>${esc(p.title)}</strong>
      <span class="tag">${esc(p.tagline)}</span>
      <span class="chips">${p.stack.slice(0, 3).map((s) => `<i>${esc(s)}</i>`).join('')}</span>
      <span class="open mono">Abrir projeto →</span>
    </button>`,
    )
    .join('');
  document.querySelectorAll('.proj').forEach((el) => {
    const i = +el.dataset.project;
    el.addEventListener('click', () => onProject(i));
    el.addEventListener('pointerenter', () => onProjectHover(i));
    el.addEventListener('pointerleave', () => onProjectHover(-1));
    el.addEventListener('focus', () => onProjectHover(i));
    el.addEventListener('blur', () => onProjectHover(-1));
  });

  // GPU
  $('#gpu-skills').innerHTML = skills
    .map(
      (g) => `
    <div class="sk-group"><h3 class="mono">${esc(g.group)}</h3>${g.items
      .map(([n, v]) => `<div class="sk"><span>${esc(n)}</span><b class="mono">${v}%</b><i style="--v:${v}%"></i></div>`)
      .join('')}</div>`,
    )
    .join('');

  // SSD
  $('#ssd-list').innerHTML = experience
    .map(
      (e, i) => `
    <li style="--d:${i * 90}ms">
      <span class="sector mono">SETOR ${String(i).padStart(2, '0')} · ${esc(e.period)}</span>
      <strong>${esc(e.title)}</strong><em>${esc(e.org)}</em>
      <p>${esc(e.text)}</p>
      <span class="chips">${e.tags.map((t) => `<i>${esc(t)}</i>`).join('')}</span>
    </li>`,
    )
    .join('');

  // I/O
  $('#io-email').textContent = profile.email;
  $('#io-email').href = `mailto:${profile.email}`;
  $('#io-links').innerHTML = profile.links.map((l) => `<a class="port" href="${esc(l.url)}"${ext(l.url)}><i></i>${esc(l.label)}</a>`).join('');
  $('#io-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const subject = encodeURIComponent(`Contato pelo portfólio — ${f.get('name')}`);
    const body = encodeURIComponent(`${f.get('message')}\n\n${f.get('name')}`);
    location.href = `mailto:${profile.email}?subject=${subject}&body=${body}`;
  });
  $('#year').textContent = new Date().getFullYear();
  $('#foot-name').textContent = profile.name;

  // Copy buttons
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      b.classList.add('done');
      setTimeout(() => b.classList.remove('done'), 1400);
    } catch {
      location.href = `mailto:${b.dataset.copy}`;
    }
  });

  // Expanders
  document.querySelectorAll('[data-expand]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = $(btn.dataset.expand);
      const open = t.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
      btn.querySelector('span').textContent = open ? 'Recolher' : btn.dataset.label;
    });
  });
}

/* ------------------------------------------------------------------ */
/* Project modal                                                       */
/* ------------------------------------------------------------------ */

export function createModal({ onOpen, onClose }) {
  const dlg = $('#project');
  let current = -1;
  // Safari < 15.4 (and other old engines) have no <dialog>: emulate it with a class + backdrop.
  const native = typeof dlg.showModal === 'function' && !(import.meta.env.DEV && /[?&]nodialog\b/.test(location.search));
  const backdrop = native ? null : document.body.appendChild(Object.assign(document.createElement('div'), { className: 'dialog-backdrop' }));
  if (!native) {
    document.documentElement.classList.add('no-dialog');
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    backdrop.addEventListener('click', () => close());
    addEventListener('keydown', (e) => e.key === 'Escape' && isOpen() && close());
  }
  const isOpen = () => dlg.hasAttribute('open');
  let lastFocus = null;
  function show() {
    if (native) return dlg.showModal();
    lastFocus = document.activeElement;
    dlg.setAttribute('open', '');
    document.body.classList.add('modal-open');
    $('.m-close', dlg).focus();
  }
  function hide() {
    if (native) return dlg.close();
    dlg.removeAttribute('open');
    document.body.classList.remove('modal-open');
    lastFocus && lastFocus.focus && lastFocus.focus();
    dlg.dispatchEvent(new Event('close'));
  }

  function fill(i) {
    const p = projects[i];
    dlg.style.setProperty('--c', p.color);
    $('.m-img img', dlg).src = cover(p);
    $('.m-img img', dlg).alt = `Tela do projeto ${p.title}`;
    $('.m-slot', dlg).textContent = `${p.slot} · ${p.year} · ${p.role}`;
    $('.m-title', dlg).textContent = p.title;
    $('.m-tagline', dlg).textContent = p.tagline;
    $('.m-desc', dlg).textContent = p.description;
    $('.m-topics', dlg).innerHTML = p.topics.map((t) => `<li>${esc(t)}</li>`).join('');
    $('.m-stack', dlg).innerHTML = p.stack.map((t) => `<i>${esc(t)}</i>`).join('');
    $('.m-metrics', dlg).innerHTML = p.metrics.map(([v, k]) => `<li><b>${esc(v)}</b><span>${esc(k)}</span></li>`).join('');
    $('.m-demo', dlg).href = p.links.demo;
    $('.m-code', dlg).href = p.links.code;
    $('.m-count', dlg).textContent = `${i + 1} / ${projects.length}`;
    dlg.querySelector('.m-body').scrollTop = 0;
    dlg.classList.remove('swap');
    void dlg.offsetWidth;
    dlg.classList.add('swap');
  }
  function open(i) {
    current = (i + projects.length) % projects.length;
    fill(current);
    if (!isOpen()) show();
    onOpen(current);
  }
  function close() {
    if (!isOpen()) return;
    dlg.classList.add('closing');
    setTimeout(() => {
      dlg.classList.remove('closing');
      hide();
    }, 220);
  }
  dlg.addEventListener('close', () => {
    current = -1;
    onClose();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close();
  });
  $('.m-close', dlg).addEventListener('click', close);
  $('.m-prev', dlg).addEventListener('click', () => open(current - 1));
  $('.m-next', dlg).addEventListener('click', () => open(current + 1));
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') open(current - 1);
    if (e.key === 'ArrowRight') open(current + 1);
  });
  return { open, close, get current() { return current; } };
}

/* ------------------------------------------------------------------ */
/* Boot screen (POST)                                                  */
/* ------------------------------------------------------------------ */

export function bootLines() {
  return [
    'PORTFOLIO X1 BIOS v1.0 · Copyright (C) ' + new Date().getFullYear(),
    '',
    `CPU  : ${profile.name} · ${profile.role}`,
    'CORE : 8 competências @ 6 anos de experiência',
    `MEM  : ${projects.length} × DDR5 · ${projects.map((p) => p.title).join(' · ')}`,
    'GPU  : SKILLS RX 9000 · ' + skills.reduce((n, g) => n + g.items.length, 0) + ' ferramentas',
    `SSD  : NVMe · ${experience.length} setores de experiência`,
    `NET  : ${profile.email}`,
    '',
    'Detectando componentes ........ OK',
    'Carregando texturas ........... OK',
  ];
}

export async function runBoot(progress) {
  const el = $('#boot');
  const log = $('#boot-log');
  const bar = $('#boot-bar');
  let skip = false;
  // Only the first visit of a session plays the full POST; reloads (e.g. after /config edits) skip it.
  try {
    skip = !!sessionStorage.getItem('x1-booted') || window.self !== window.top;
    sessionStorage.setItem('x1-booted', '1');
  } catch {
    /* storage unavailable */
  }
  const skipNow = () => (skip = true);
  addEventListener('keydown', skipNow, { once: true });
  el.addEventListener('pointerdown', skipNow, { once: true });
  const lines = bootLines();
  for (let i = 0; i < lines.length; i++) {
    const div = document.createElement('div');
    div.textContent = lines[i] || '\u00a0';
    log.appendChild(div);
    bar.style.transform = `scaleX(${Math.min(progress(), (i + 1) / lines.length)})`;
    if (!skip) await new Promise((r) => setTimeout(r, i < 2 ? 160 : 110));
  }
  return () => {
    bar.style.transform = 'scaleX(1)';
    el.classList.add('done');
    setTimeout(() => el.remove(), 900);
  };
}

/* ------------------------------------------------------------------ */
/* Text scramble                                                       */
/* ------------------------------------------------------------------ */

const GLYPHS = '01<>/[]{}#$%&*+=?ABCDEFX';
export function scramble(el) {
  if (el.dataset.busy) return;
  const target = el.dataset.text || (el.dataset.text = el.textContent);
  el.dataset.busy = '1';
  let f = 0;
  const total = 22;
  const step = () => {
    f++;
    el.textContent = [...target]
      .map((c, i) => (c === ' ' || i < (f / total) * target.length ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0]))
      .join('');
    if (f < total) requestAnimationFrame(step);
    else {
      el.textContent = target;
      delete el.dataset.busy;
    }
  };
  step();
}
