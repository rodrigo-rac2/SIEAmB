// Titles people type before their name. The same list as the server uses for e-mail greetings
// (packages/server/src/payments/notifications.ts); the server cannot share code with the site.
const TITLE = /^(prof|profa|profª|professor|professora|dr|dra|drª|me|ma|msc|esp|sr|sra|srta)\.?ª?$/i;

/** The first word of a name that is not a title: "Profa. Viviane Farias" gives "Viviane". */
export function firstName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  return words.find((word) => !TITLE.test(word)) ?? '';
}
