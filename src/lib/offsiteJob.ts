import { encryptionConfigured } from "./dataCrypto.ts";
import { backupDirectory, readDb } from "./db.ts";
import { offsiteConfig, offsiteDue, readOffsiteStatus, uploadOffsite, type OffsiteStatus } from "./offsite.ts";

/** Upload today's encrypted copy now (the Setup page button). */
export async function offsiteBackupNow(): Promise<OffsiteStatus> {
  return uploadOffsite(await readDb(), backupDirectory());
}

/** Called by the scheduler every few minutes: uploads once a day when set up. */
export async function offsiteTick(): Promise<void> {
  if (!offsiteConfig() || !encryptionConfigured()) return;
  const dir = backupDirectory();
  if (!offsiteDue(await readOffsiteStatus(dir))) return;
  try {
    const s = await offsiteBackupNow();
    console.log(`Off-site backup uploaded: ${s.lastObject} (${s.bytes} bytes)`);
  } catch (err) {
    console.error("Off-site backup failed:", err instanceof Error ? err.message : err);
  }
}
