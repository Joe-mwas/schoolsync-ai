import ChangePasswordForm from "@/components/ChangePasswordForm";
import { PushToggle } from "@/components/NotificationBell";
import TwoStepCard from "@/components/TwoStepCard";
import { isStaff, requireUser } from "@/lib/auth";
import { readDb } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/permissions";
import PhoneForm from "./PhoneForm";

export default async function AccountPage() {
  const user = await requireUser();
  const { security } = await readDb();
  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <div className="page-header">
        <div>
          <h1>My account</h1>
          <p>{[user.name, ROLE_LABELS[user.role], user.email || user.phone].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <PhoneForm initial={user.phone ?? ""} />
      <section className="card stack" style={{ gap: 8 }}>
        <h2 style={{ margin: 0 }}>Phone notifications</h2>
        <PushToggle />
      </section>
      <ChangePasswordForm />
      {isStaff(user) && (
        <TwoStepCard enabled={Boolean(user.twoStep)} enabledAt={user.twoStep?.enabledAt} backupLeft={user.twoStep?.backupCodes.length ?? 0} required={security.requireTwoStep} />
      )}
    </div>
  );
}
