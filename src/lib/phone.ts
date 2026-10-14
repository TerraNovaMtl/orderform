export const PHONE_FORMAT_MESSAGE =
  "Enter a phone number with 7–15 digits, optionally followed by an extension.";

// Accept common domestic/international formatting and x/ext extensions.
export function isValidPhone(value: string) {
  const phone = value.trim();
  if (!phone) return true;
  const match = phone.match(
    /^(\+?[\d\s().-]+?)(?:\s*(?:x|ext\.?|extension)\s*\d{1,6})?$/i,
  );
  if (!match) return false;
  const digits = match[1].replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}
