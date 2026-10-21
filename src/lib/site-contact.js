// Public display explicitly approved by the owner.
// Empty means no email link, copy button, or address is shipped to either page.
export const PUBLIC_CONTACT_EMAIL = 'leomonan@gmail.com';

export function contactDetails(value, subject = 'AIStory — Feedback / Preview interest') {
  if (typeof value !== 'string') throw new TypeError('Contact email must be text');
  if (!value.trim()) return null;
  // Reject controls and URL delimiters rather than interpolating an unsafe URI.
  if (/[\r\n\x00-\x1f]/.test(value) ||
      !/^[A-Za-z0-9.!_+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value.trim())) {
    throw new TypeError('Invalid public contact email');
  }
  const email = value.trim();
  return { email, href: `mailto:${email}?subject=${encodeURIComponent(subject)}` };
}
