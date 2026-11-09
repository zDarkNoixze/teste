/*
 * Site content lives in content/site.json — edit it by hand or at /config while running `pnpm dev`.
 * Saving there reloads every open tab of the site automatically.
 */
import raw from '../content/site.json';
import { sanitize, withSlots } from './content.js';

const data = withSlots(sanitize(raw));

// Reload only pages that render the site; without this, Vite would full-reload every
// open page on edits, including the /config editor itself.
if (import.meta.hot) import.meta.hot.accept('../content/site.json', () => location.reload());

export const { profile, projects, skills, experience } = data;

/** Resolves an image path from the content file to a URL. */
export function asset(path) {
  if (!path) return '';
  return /^(https?:|data:)/i.test(path) ? path : `${import.meta.env.BASE_URL}${path}`;
}
