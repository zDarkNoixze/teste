import { DIMM, MAX_PROJECTS, emptyProject } from '../content.js';
import './config.css';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clone = (o) => JSON.parse(JSON.stringify(o));
const BASE = import.meta.env.BASE_URL;
const imgUrl = (p) => (!p ? '' : /^(https?:|data:)/i.test(p) ? p : `${BASE}${p}`);

let state = null;
let initial = null;
let tab = 'profile';
let focus = { section: 1 };
const form = $('#form');
const frame = $('#frame');

/* ------------------------------------------------------------------ */
/* Paths                                                               */
/* ------------------------------------------------------------------ */

const parsePath = (s) => s.split('.').map((k) => (/^\d+$/.test(k) ? Number(k) : k));
function setPath(obj, path, value) {
  const keys = parsePath(path);
  let o = obj;
  keys.slice(0, -1).forEach((k, i) => {
    if (o[k] == null) o[k] = typeof keys[i + 1] === 'number' ? [] : {};
    o = o[k];
  });
  o[keys[keys.length - 1]] = value;
}
const getPath = (obj, path) => parsePath(path).reduce((o, k) => (o == null ? o : o[k]), obj);

/* ------------------------------------------------------------------ */
/* Saving                                                              */
/* ------------------------------------------------------------------ */

const statusEl = $('#status');
function status(state, text) {
  statusEl.dataset.state = state;
  statusEl.textContent = text;
}
function cleaned() {
  const d = clone(state);
  for (const p of d.projects) p.metrics = (p.metrics || []).filter((m) => m && (m[0] || m[1]));
  return d;
}
let saveTimer = 0;
let saving = Promise.resolve();
function scheduleSave(delay = 650) {
  status('dirty', 'Alterações pendentes…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, delay);
}
function save() {
  clearTimeout(saveTimer);
  const body = JSON.stringify(cleaned());
  saving = saving.then(async () => {
    status('saving', 'Salvando…');
    try {
      const r = await fetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
      status('saved', `Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
    } catch (e) {
      status('error', `Não salvou: ${e.message}`);
    }
  });
  return saving;
}
addEventListener('beforeunload', (e) => {
  if (statusEl.dataset.state === 'dirty' || statusEl.dataset.state === 'saving') {
    save();
    e.preventDefault();
  }
});

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
}

/* ------------------------------------------------------------------ */
/* Live preview                                                        */
/* ------------------------------------------------------------------ */

function sendFocus(f) {
  focus = f;
  frame.contentWindow?.postMessage({ type: 'x1:focus', ...f }, location.origin);
}
addEventListener('message', (e) => {
  if (e.origin === location.origin && e.data?.type === 'x1:ready') sendFocus(focus);
});
$('#reload').addEventListener('click', () => frame.contentWindow.location.reload());
$('#toggle-preview').addEventListener('click', (e) => {
  const on = document.body.classList.toggle('no-preview');
  e.currentTarget.setAttribute('aria-pressed', String(!on));
});

/* ------------------------------------------------------------------ */
/* Field helpers                                                       */
/* ------------------------------------------------------------------ */

const field = (label, path, { kind = 'text', type = 'text', rows = 3, hint = '', placeholder = '', wide = false } = {}) => {
  const v = getPath(state, path);
  const id = `f-${path.replace(/\./g, '-')}`;
  let input;
  if (kind === 'textarea' || kind === 'lines') {
    const val = kind === 'lines' ? (v || []).join('\n') : v ?? '';
    input = `<textarea id="${id}" rows="${rows}" data-path="${path}" data-kind="${kind}" placeholder="${esc(placeholder)}">${esc(val)}</textarea>`;
  } else if (kind === 'csv') {
    input = `<input id="${id}" data-path="${path}" data-kind="csv" value="${esc((v || []).join(', '))}" placeholder="${esc(placeholder)}" />`;
  } else {
    input = `<input id="${id}" type="${type}" data-path="${path}" value="${esc(v ?? '')}" placeholder="${esc(placeholder)}" />`;
  }
  return `<label class="field${wide ? ' wide' : ''}" for="${id}"><span>${esc(label)}</span>${input}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
};
const row = (...items) => `<div class="row">${items.join('')}</div>`;
const listBtns = (list, i, len, { min = 0 } = {}) => `
  <div class="item-actions">
    <button type="button" class="icon" data-action="up" data-list="${list}" data-index="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
    <button type="button" class="icon" data-action="down" data-list="${list}" data-index="${i}" ${i === len - 1 ? 'disabled' : ''} aria-label="Descer">↓</button>
    <button type="button" class="icon danger" data-action="remove" data-list="${list}" data-index="${i}" ${len <= min ? 'disabled' : ''} aria-label="Remover">✕</button>
  </div>`;

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

const views = {
  profile() {
    const p = state.profile;
    return `
      <h1>Perfil <small>· aparece no processador, na tela de BIOS e no contato</small></h1>
      <div class="card">
        ${row(field('Nome', 'profile.name'), field('Cargo / título', 'profile.role'))}
        ${row(field('E-mail', 'profile.email', { type: 'email' }), field('Telefone', 'profile.phone'))}
        ${row(field('Cidade', 'profile.location'), field('Disponibilidade', 'profile.availability', { placeholder: 'Disponível para novos projetos' }))}
        ${field('Bio', 'profile.bio', { kind: 'textarea', rows: 3 })}
      </div>
      <h2>Links</h2>
      <div class="card">
        ${p.links.map((l, i) => `<div class="pair">${field('Nome', `profile.links.${i}.label`, { placeholder: 'GitHub' })}${field('URL', `profile.links.${i}.url`, { type: 'url', placeholder: 'https://' })}${listBtns('profile.links', i, p.links.length)}</div>`).join('')}
        <button type="button" class="add" data-action="add" data-list="profile.links">+ Adicionar link</button>
      </div>
      <h2>Ficha técnica <small>· a lista “Ver ficha técnica” do processador</small></h2>
      <div class="card">
        ${p.specs.map((s, i) => `<div class="pair">${field('Item', `profile.specs.${i}.0`)}${field('Valor', `profile.specs.${i}.1`)}${listBtns('profile.specs', i, p.specs.length)}</div>`).join('')}
        <button type="button" class="add" data-action="add" data-list="profile.specs">+ Adicionar item</button>
      </div>`;
  },

  projects() {
    const ps = state.projects;
    return `
      <h1>Projetos <small>· um por pente de memória (máx. ${MAX_PROJECTS})</small></h1>
      ${ps.map((p, i) => `
        <details class="card project" data-project="${i}" ${focus.project === i || (focus.project == null && i === 0) ? 'open' : ''} style="--c:${esc(p.color)}">
          <summary>
            <i class="swatch"></i><span class="slot mono">${DIMM[i]}</span><strong>${esc(p.title) || 'Sem título'}</strong>
            ${listBtns('projects', i, ps.length, { min: 1 })}
          </summary>
          <div class="project-body">
            <div class="image-field">
              <div class="thumb" data-drop="projects.${i}.image">
                ${p.image ? `<img src="${esc(imgUrl(p.image))}" alt="" />` : '<span>Sem imagem<br /><small>Arraste uma imagem aqui</small></span>'}
              </div>
              <div class="image-controls">
                <label class="btn small file">Enviar imagem<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" data-upload="projects.${i}.image" hidden /></label>
                ${p.image ? `<button type="button" class="ghost small" data-action="clear-image" data-index="${i}">Remover</button>` : ''}
                ${field('…ou URL / caminho da imagem', `projects.${i}.image`, { placeholder: 'https://… ou projects/minha-imagem.png' })}
                <small class="muted">PNG, JPG, WEBP, GIF ou AVIF até 8 MB · proporção ideal 16:10</small>
              </div>
            </div>
            ${row(field('Título', `projects.${i}.title`), field('Ano', `projects.${i}.year`))}
            ${row(field('Frase de destaque', `projects.${i}.tagline`), field('Seu papel', `projects.${i}.role`))}
            <div class="row">
              <label class="field color"><span>Cor do pente</span><input type="color" data-path="projects.${i}.color" value="${esc(p.color)}" /></label>
              ${field('Link ao vivo', `projects.${i}.links.demo`, { placeholder: 'https://' })}
              ${field('Link do código', `projects.${i}.links.code`, { placeholder: 'https://' })}
            </div>
            ${field('Descrição', `projects.${i}.description`, { kind: 'textarea', rows: 4 })}
            ${field('Tópicos', `projects.${i}.topics`, { kind: 'lines', rows: 4, hint: 'Um tópico por linha' })}
            ${field('Tecnologias', `projects.${i}.stack`, { kind: 'csv', hint: 'Separadas por vírgula', placeholder: 'React, TypeScript, Node.js' })}
            <div class="metrics"><span class="label">Métricas</span>
              ${[0, 1, 2].map((j) => `<div class="pair">${field('Valor', `projects.${i}.metrics.${j}.0`, { placeholder: '+27%' })}${field('Descrição', `projects.${i}.metrics.${j}.1`, { placeholder: 'conversão' })}</div>`).join('')}
            </div>
          </div>
        </details>`).join('')}
      <button type="button" class="add big" data-action="add" data-list="projects" ${ps.length >= MAX_PROJECTS ? 'disabled' : ''}>
        ${ps.length >= MAX_PROJECTS ? `Os ${MAX_PROJECTS} slots de memória estão ocupados` : '+ Adicionar projeto'}
      </button>`;
  },

  skills() {
    const gs = state.skills;
    return `
      <h1>Habilidades <small>· barras da placa de vídeo</small></h1>
      ${gs.map((g, gi) => `
        <div class="card">
          <div class="group-head">${field('Grupo', `skills.${gi}.group`)}${listBtns('skills', gi, gs.length)}</div>
          ${g.items.map((it, ii) => `
            <div class="skill">
              <input data-path="skills.${gi}.items.${ii}.0" value="${esc(it[0])}" aria-label="Habilidade" placeholder="Habilidade" />
              <input type="range" min="0" max="100" data-path="skills.${gi}.items.${ii}.1" data-kind="number" value="${it[1]}" aria-label="Nível" />
              <output class="mono">${it[1]}%</output>
              <button type="button" class="icon danger" data-action="remove" data-list="skills.${gi}.items" data-index="${ii}" aria-label="Remover">✕</button>
            </div>`).join('')}
          <button type="button" class="add" data-action="add" data-list="skills.${gi}.items">+ Adicionar habilidade</button>
        </div>`).join('')}
      <button type="button" class="add big" data-action="add" data-list="skills">+ Adicionar grupo</button>`;
  },

  experience() {
    const es = state.experience;
    return `
      <h1>Experiência <small>· linha do tempo do SSD, da mais recente para a mais antiga</small></h1>
      ${es.map((e, i) => `
        <div class="card">
          <div class="group-head"><span class="mono muted">SETOR ${String(i).padStart(2, '0')}</span>${listBtns('experience', i, es.length)}</div>
          ${row(field('Período', `experience.${i}.period`, { placeholder: '2023 — hoje' }), field('Cargo', `experience.${i}.title`))}
          ${field('Empresa / instituição', `experience.${i}.org`)}
          ${field('Descrição', `experience.${i}.text`, { kind: 'textarea', rows: 2 })}
          ${field('Tags', `experience.${i}.tags`, { kind: 'csv', hint: 'Separadas por vírgula' })}
        </div>`).join('')}
      <button type="button" class="add big" data-action="add" data-list="experience">+ Adicionar experiência</button>`;
  },
};

const SECTION = { profile: 1, projects: 2, skills: 3, experience: 4 };
function render() {
  form.innerHTML = views[tab]();
  document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
}
function showTab(t) {
  tab = t;
  render();
  form.scrollTop = 0;
  scrollTo(0, 0);
  sendFocus({ section: SECTION[t] });
}
document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

form.addEventListener('input', (e) => {
  const el = e.target;
  const path = el.dataset.path;
  if (!path) return;
  let v = el.value;
  if (el.dataset.kind === 'lines') v = v.split('\n').map((s) => s.trim()).filter(Boolean);
  if (el.dataset.kind === 'csv') v = v.split(',').map((s) => s.trim()).filter(Boolean);
  if (el.dataset.kind === 'number') {
    v = Number(v);
    el.nextElementSibling.textContent = `${v}%`;
  }
  setPath(state, path, v);
  // Keep visible summaries in sync without re-rendering (which would steal focus).
  const card = el.closest('.project');
  if (card) {
    if (path.endsWith('.title')) $('summary strong', card).textContent = v || 'Sem título';
    if (path.endsWith('.color')) card.style.setProperty('--c', v);
    if (path.endsWith('.image')) refreshThumb(card, v);
  }
  scheduleSave();
});

form.addEventListener('focusin', (e) => {
  const card = e.target.closest('.project');
  const f = card ? { section: 2, project: Number(card.dataset.project) } : { section: SECTION[tab] };
  if (f.section !== focus.section || f.project !== focus.project) sendFocus(f);
});
form.addEventListener('toggle', (e) => {
  if (e.target.matches?.('details.project') && e.target.open) sendFocus({ section: 2, project: Number(e.target.dataset.project) });
}, true);

form.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  e.preventDefault();
  const { action, list, index } = b.dataset;
  const i = Number(index);
  if (action === 'clear-image') {
    state.projects[i].image = '';
    render();
    return save();
  }
  const arr = getPath(state, list);
  if (action === 'add') {
    const blank = {
      'profile.links': { label: '', url: '' },
      'profile.specs': ['', ''],
      projects: emptyProject(),
      skills: { group: 'Novo grupo', items: [['Nova habilidade', 50]] },
      experience: { period: '', title: '', org: '', text: '', tags: [] },
    }[list] ?? ['Nova habilidade', 50];
    if (list === 'projects') {
      if (arr.length >= MAX_PROJECTS) return;
      blank.id = `p${Date.now().toString(36)}`;
      focus = { section: 2, project: arr.length };
    }
    arr.push(blank);
  } else if (action === 'remove') {
    if (list === 'projects' && arr.length <= 1) return;
    const label = list === 'projects' ? `o projeto “${arr[i].title}”` : 'este item';
    if (!confirm(`Remover ${label}?`)) return;
    arr.splice(i, 1);
    if (list === 'projects') focus = { section: 2, project: Math.min(i, arr.length - 1) };
  } else if (action === 'up' || action === 'down') {
    const j = action === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    if (list === 'projects') focus = { section: 2, project: j };
  }
  render();
  save();
  if (list === 'projects') sendFocus(focus);
});

/* ---------------- Images ---------------- */
function refreshThumb(card, value) {
  const thumb = $('.thumb', card);
  thumb.innerHTML = value ? `<img src="${esc(imgUrl(value))}" alt="" />` : '<span>Sem imagem<br /><small>Arraste uma imagem aqui</small></span>';
}
async function upload(file, path) {
  if (!file) return;
  if (file.size > 8_000_000) return toast('Imagem maior que 8 MB');
  status('saving', 'Enviando imagem…');
  try {
    const r = await fetch(`/api/upload?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
    setPath(state, path, j.path);
    render();
    await save();
    toast('Imagem enviada ✓');
  } catch (e) {
    status('error', `Falha no envio: ${e.message}`);
  }
}
form.addEventListener('change', (e) => {
  const path = e.target.dataset.upload;
  if (path) upload(e.target.files[0], path);
});
form.addEventListener('dragover', (e) => {
  const t = e.target.closest('[data-drop]');
  if (!t) return;
  e.preventDefault();
  t.classList.add('over');
});
form.addEventListener('dragleave', (e) => e.target.closest('[data-drop]')?.classList.remove('over'));
form.addEventListener('drop', (e) => {
  const t = e.target.closest('[data-drop]');
  if (!t) return;
  e.preventDefault();
  t.classList.remove('over');
  upload(e.dataTransfer.files[0], t.dataset.drop);
});

/* ---------------- Header buttons ---------------- */
$('#download').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(cleaned(), null, 2)], { type: 'application/json' }));
  a.download = 'site.json';
  a.click();
  URL.revokeObjectURL(a.href);
});
$('#undo').addEventListener('click', () => {
  if (!confirm('Voltar todo o conteúdo para como estava quando você abriu esta página?')) return;
  state = clone(initial);
  render();
  save();
  toast('Conteúdo restaurado');
});

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

try {
  const r = await fetch('/api/config', { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  state = await r.json();
  initial = clone(state);
  render();
  status('saved', 'Tudo salvo');
  sendFocus(focus);
} catch {
  status('error', 'Editor indisponível');
  form.innerHTML = `
    <div class="card offline">
      <h1>O editor só funciona com o servidor de desenvolvimento</h1>
      <p>Abra <code>/config</code> no link de preview ou rode <code>pnpm dev</code> e acesse <code>http://localhost:5173/config</code>.
      Em produção o conteúdo vem de <code>content/site.json</code>, gerado no build.</p>
    </div>`;
}
