import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getIncompleteFiles } from "../../../../lib/files-client";
import { getCurrentIdentity } from "../../../../lib/identity-client";
import { canManageFiles } from "../../../../lib/navigation";
import { IncompleteFilesReview } from "./incomplete-files-review";

export default async function FileReviewPage() {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie") ?? undefined;
  const identity = await getCurrentIdentity(fetch, process.env, cookie);
  if (!canManageFiles(identity.user.role)) redirect("/");
  const files = await getIncompleteFiles(fetch, process.env, cookie);
  return (
    <main className="page-main">
      <div className="page-heading">
        <p className="eyebrow">Owner Admin</p>
        <h1>Incomplete file review</h1>
        <p className="lede">
          Review failed uploads and expired pending grants. Cleanup abandons the
          metadata safely and removes any partial private object.
        </p>
      </div>
      <IncompleteFilesReview initialFiles={files} />
    </main>
  );
}
