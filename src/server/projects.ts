import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projects, videos } from "@/db/schema";
import { NotFound, type Member } from "./users";

export const createProjectInput = z
  .object({ name: z.string().trim().min(1, "Name is required").max(80), shared: z.boolean() })
  .strict();

/** Projects this member can see: every shared one and their own personal ones. */
export function listProjects(member: Member) {
  return db
    .select({ id: projects.id, name: projects.name, shared: projects.shared, ownerId: projects.ownerId })
    .from(projects)
    .where(and(eq(projects.orgId, member.orgId), or(eq(projects.shared, true), eq(projects.ownerId, member.id))))
    .orderBy(projects.name);
}

export async function visibleProject(member: Member, id: string) {
  const [row] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, id),
        eq(projects.orgId, member.orgId),
        or(eq(projects.shared, true), eq(projects.ownerId, member.id)),
      ),
    );
  return row ?? null;
}

export async function createProject(member: Member, input: z.infer<typeof createProjectInput>) {
  const [row] = await db
    .insert(projects)
    .values({ id: crypto.randomUUID(), orgId: member.orgId, ownerId: member.id, name: input.name, shared: input.shared })
    .returning({ id: projects.id, name: projects.name, shared: projects.shared });
  return row!;
}

/** Deletes a project its owner made; its videos go back to their creators. */
export async function deleteProject(member: Member, id: string) {
  const project = await visibleProject(member, id);
  if (!project || project.ownerId !== member.id) throw new NotFound("No project of yours with that id");
  await db.batch([
    db.update(videos).set({ projectId: null }).where(eq(videos.projectId, id)),
    db.delete(projects).where(eq(projects.id, id)),
  ]);
  return { id };
}
