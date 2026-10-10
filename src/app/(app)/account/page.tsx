import ChangePasswordForm from "@/components/ChangePasswordForm";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import PhoneForm from "./PhoneForm";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <div className="page-header">
        <div>
          <h1>My account</h1>
          <p>{[user.name, ROLE_LABELS[user.role], user.email || user.phone].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <PhoneForm initial={user.phone ?? ""} />
      <ChangePasswordForm />
    </div>
  );
}
