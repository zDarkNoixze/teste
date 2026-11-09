/*
 * Shared by the site, the /config editor and the dev-server API (Node):
 * coerces any edited content into the shape the site expects, with safe URLs.
 */

export const DIMM = ['DIMM_A1', 'DIMM_A2', 'DIMM_B1', 'DIMM_B2'];
export const MAX_PROJECTS = DIMM.length; // one per RAM slot on the board

const str = (v, max = 300) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

/** Allows http(s)/mailto/tel, in-page anchors and relative paths; anything else becomes '#'. */
export function safeUrl(v) {
  const s = str(v, 600).trim();
  if (!s) return '#';
  const scheme = s.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!scheme) return s;
  return /^(https?|mailto|tel)$/i.test(scheme[1]) ? s : '#';
}

/** Image source: http(s), data:image/… or a path relative to the site root. */
export function safeImage(v) {
  const s = str(v, 2_000_000).trim();
  if (/^data:image\/(png|jpe?g|webp|gif|avif);/i.test(s)) return s;
  const scheme = s.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme) return /^https?$/i.test(scheme[1]) ? s : '';
  return s.replace(/^\/+/, '');
}

const color = (v) => (/^#[0-9a-f]{6}$/i.test(str(v)) ? str(v).toLowerCase() : '#35e0ff');
const pct = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

export function emptyProject() {
  return {
    title: 'Novo projeto',
    tagline: 'Uma frase sobre o projeto',
    year: String(new Date().getFullYear()),
    role: 'Seu papel',
    color: '#35e0ff',
    image: '',
    description: '',
    topics: [],
    stack: [],
    metrics: [],
    links: { demo: '#', code: '#' },
  };
}

export function sanitize(raw = {}) {
  const p = raw.profile || {};
  const profile = {
    name: str(p.name, 60),
    role: str(p.role, 80),
    location: str(p.location, 80),
    email: str(p.email, 120),
    phone: str(p.phone, 40),
    site: str(p.site, 120),
    availability: str(p.availability, 80),
    bio: str(p.bio, 600),
    links: arr(p.links, 8).map((l) => ({ label: str(l?.label, 40), url: safeUrl(l?.url) })),
    specs: arr(p.specs, 12).map((s) => [str(s?.[0], 40), str(s?.[1], 80)]),
  };

  let projects = arr(raw.projects, MAX_PROJECTS).map((q = {}, i) => ({
    id: str(q.id, 40) || `p${i + 1}`,
    title: str(q.title, 60),
    tagline: str(q.tagline, 140),
    year: str(q.year, 12),
    role: str(q.role, 60),
    color: color(q.color),
    image: safeImage(q.image),
    description: str(q.description, 1500),
    topics: arr(q.topics, 10).map((t) => str(t, 220)),
    stack: arr(q.stack, 16).map((t) => str(t, 40)),
    metrics: arr(q.metrics, 3).map((m) => [str(m?.[0], 20), str(m?.[1], 60)]),
    links: { demo: safeUrl(q.links?.demo), code: safeUrl(q.links?.code) },
  }));
  if (!projects.length) projects = [{ ...emptyProject(), id: 'p1' }];

  const skills = arr(raw.skills, 6).map((g = {}) => ({
    group: str(g.group, 40),
    items: arr(g.items, 10).map((it) => [str(it?.[0], 40), pct(it?.[1])]),
  }));

  const experience = arr(raw.experience, 10).map((e = {}) => ({
    period: str(e.period, 40),
    title: str(e.title, 80),
    org: str(e.org, 80),
    text: str(e.text, 400),
    tags: arr(e.tags, 8).map((t) => str(t, 30)),
  }));

  return { profile, projects, skills, experience };
}

/** Adds the slot names the board and panels display. */
export function withSlots(data) {
  return { ...data, projects: data.projects.map((p, i) => ({ ...p, slot: DIMM[i] })) };
}
