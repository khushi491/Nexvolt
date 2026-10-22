/** Normalise an Indian mobile number to E.164 (+91XXXXXXXXXX). Returns null if invalid. */
export function normalizeIndianPhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '');
  const m = /^(?:\+91|0091|91|0)?([6-9]\d{9})$/.exec(digits);
  return m ? `+91${m[1]}` : null;
}

export function isIndianMobile(input: string): boolean {
  return normalizeIndianPhone(input) !== null;
}

/** Mask for logs/UI: +91 98•••••210 */
export function maskPhone(e164: string): string {
  if (e164.length < 8) return '•••';
  return `${e164.slice(0, 3)} ${e164.slice(3, 5)}•••••${e164.slice(-3)}`;
}

export function formatIndianPhone(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}
