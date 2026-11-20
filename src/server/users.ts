import { isAdmin } from "@every-app/sdk/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, workspaceSettings } from "@/db/schema";

/** The verified member, as every query takes it. */
export interface Member {
  id: string;
  orgId: string;
  email: string;
  admin: boolean;
}

export function toMember(user: { id: string; orgId: string; email: string; orgRole: string }): Member {
  return { id: user.id, orgId: user.orgId, email: user.email, admin: isAdmin(user) };
}

/** Records the member the first time they are seen, keeping the email the Gateway sent. */
export async function rememberMember(member: Member): Promise<void> {
  await db
    .insert(users)
    .values({ id: member.id, orgId: member.orgId, email: member.email })
    .onConflictDoUpdate({ target: users.id, set: { email: member.email } });
}

export async function getSettings(orgId: string) {
  const [row] = await db.select().from(workspaceSettings).where(eq(workspaceSettings.orgId, orgId));
  return { adminOnlySavedScenes: row?.adminOnlySavedScenes ?? false };
}

export async function setAdminOnlySavedScenes(member: Member, value: boolean) {
  if (!member.admin) throw new Forbidden("Only admins can change this setting.");
  await db
    .insert(workspaceSettings)
    .values({ orgId: member.orgId, adminOnlySavedScenes: value })
    .onConflictDoUpdate({ target: workspaceSettings.orgId, set: { adminOnlySavedScenes: value } });
  return getSettings(member.orgId);
}

export class Forbidden extends Error {
  status = 403;
}
export class NotFound extends Error {
  status = 404;
  constructor(message = "Not found") {
    super(message);
  }
}
