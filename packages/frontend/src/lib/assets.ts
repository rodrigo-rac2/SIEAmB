/** Resolve an event asset path: absolute URLs pass through, relative paths hang off the site base. */
export function assetUrl(path: string): string {
  return /^https?:/.test(path) ? path : import.meta.env.BASE_URL + path;
}
