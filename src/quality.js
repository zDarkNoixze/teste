/*
 * Picks how much the device can render. No three.js here: this runs before the 3D chunk
 * is even downloaded, so devices that cannot run it never pay for it.
 *
 *   high   — desktop/flagship GPU: full resolution, MSAA, bloom, 2K shadows, full HDR
 *   medium — typical phone/laptop: capped resolution, half-res bloom, 1K shadows
 *   low    — weak GPU: no post-processing, no shadows, procedural lighting
 *   static — only when WebGL2 is unavailable (e.g. iOS < 15): pre-rendered images + CSS motion
 *
 * `?q=high|medium|low|static` forces a tier (and disables the runtime governor).
 */

export const ORDER = ['static', 'low', 'medium', 'high'];
const CAP_KEY = 'x1-q-cap';
const CAP_DAYS = 14;

const SOFTWARE = /SwiftShader|llvmpipe|softpipe|Software|Microsoft Basic|Mesa OffScreen/i;
const WEAK_GPU =
  /SwiftShader|llvmpipe|softpipe|Software|Microsoft Basic|Mali-(4\d\d|T[6-7]\d\d)|Adreno \(TM\) ([2-4]\d\d|50\d)|PowerVR (SGX|Rogue G6)|Intel.*(GMA|HD Graphics( [2-4]\d{3})?$)|Vivante|VideoCore/i;
const MID_GPU = /Mali-(T8|G[357]\d)|Adreno \(TM\) (5[1-4]\d|6[0-3]\d)|Intel.*(HD|UHD) Graphics|PowerVR/i;

const min = (a, b) => ORDER[Math.min(ORDER.indexOf(a), ORDER.indexOf(b))];

function probeGL() {
  const out = { webgl2: false, software: false, gpu: '' };
  try {
    const c = document.createElement('canvas');
    // failIfMajorPerformanceCaveat refuses software/blocklisted GPUs where WebGL would crawl.
    let gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (!gl) {
      const slow = c.getContext('webgl2');
      if (slow) {
        out.software = true;
        gl = slow;
      }
    }
    if (!gl) return out;
    out.webgl2 = true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    out.gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
    out.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    /* treat as no WebGL2 */
  }
  return out;
}

export function readCap() {
  try {
    const c = JSON.parse(localStorage.getItem(CAP_KEY) || 'null');
    if (c && ORDER.includes(c.tier) && c.tier !== 'static' && Date.now() - c.t < CAP_DAYS * 864e5) return c.tier;
  } catch {
    /* ignore */
  }
  return null;
}

/** Remembers that this device could not hold `tier`, so the next visit starts there. */
export function saveCap(tier) {
  try {
    localStorage.setItem(CAP_KEY, JSON.stringify({ tier, t: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function clearCap() {
  try {
    localStorage.removeItem(CAP_KEY);
  } catch {
    /* ignore */
  }
}

export function detectTier() {
  const forced = new URLSearchParams(location.search).get('q');
  const gl = probeGL();
  const info = { gpu: gl.gpu, webgl2: gl.webgl2, forced: false, reasons: [] };

  if (ORDER.includes(forced)) {
    info.forced = true;
    info.reasons.push('url');
    return { tier: forced === 'static' || gl.webgl2 ? forced : 'static', ...info };
  }
  if (!gl.webgl2) return { tier: 'static', ...info, reasons: ['sem WebGL2'] };

  const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const mem = navigator.deviceMemory || 0; // Chromium only; 0 = unknown
  const cores = navigator.hardwareConcurrency || 0;
  const conn = navigator.connection || {};
  const px = screen.width * screen.height * Math.min(devicePixelRatio || 1, 3) ** 2;

  let tier = mobile ? 'medium' : 'high';
  if (SOFTWARE.test(gl.gpu)) gl.software = true;
  if (gl.software || WEAK_GPU.test(gl.gpu)) {
    tier = 'low';
    info.reasons.push(gl.software ? 'renderização por software' : 'GPU antiga');
  } else if (MID_GPU.test(gl.gpu)) tier = min(tier, 'medium');
  if (mem && mem <= 2) (tier = min(tier, 'low')), info.reasons.push('pouca memória');
  else if (mem && mem <= 4) tier = min(tier, 'medium');
  if (cores && cores <= 2) (tier = min(tier, 'low')), info.reasons.push('poucos núcleos');
  if (gl.maxTex && gl.maxTex < 4096) tier = min(tier, 'low');
  // Flagship phones (lots of memory and cores) get the full experience.
  if (mobile && mem >= 8 && cores >= 8 && tier === 'medium' && !MID_GPU.test(gl.gpu)) tier = 'high';
  // Very large screens on mid hardware: resolution scaling handles it, but start one notch lower.
  if (!mobile && px > 9e6 && cores && cores <= 4) tier = min(tier, 'medium');
  if (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')) {
    tier = 'low';
    info.reasons.push('economia de dados');
  }

  const cap = readCap();
  if (cap) {
    tier = min(tier, cap);
    info.reasons.push(`limite salvo: ${cap}`);
  }
  return { tier, ...info };
}
