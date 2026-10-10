/** Import formats shared by the server and the browser (no server-only imports). */

export const TEMPLATE_CSV = [
  "Student name,Class,Student email,Parent name,Parent phone,Parent email",
  "Brian Kamau,Grade 7 East,,James Kamau,0712 345 678,",
  "Mercy Kamau,Grade 5 North,,James Kamau,0712 345 678,",
  "Faith Njeri,Grade 8 West,faith@example.com,Ann Njeri,+254 722 000 111,ann@example.com",
].join("\r\n");

export interface IssuedCredential {
  name: string;
  role: "student" | "parent";
  signIn: string;
  temporaryPassword: string;
  /** For parents: their children, to help hand out the details. */
  note: string;
}

/** CSV of issued temporary passwords for the director to hand out. */
export function credentialsCsv(creds: IssuedCredential[]): string {
  const esc = (raw: string) => {
    // Stop spreadsheet apps treating names like "=SUM(...)" as formulas (phone numbers like +254… are fine).
    const v = /^[=@]|^[+-][^\d\s]/.test(raw) ? `'${raw}` : raw;
    return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = [["Name", "Role", "Sign in with", "Temporary password", "Children / class"]];
  for (const c of creds) lines.push([c.name, c.role, c.signIn, c.temporaryPassword, c.note]);
  return "\uFEFF" + lines.map((l) => l.map(esc).join(",")).join("\r\n");
}
