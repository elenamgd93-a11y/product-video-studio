import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { brandKits, media } from "@/db/schema";
import { DEFAULT_KIT_CONTENT, kitContentSchema, type KitContent, type KitSnapshot } from "@/lib/video";
import { NotFound, type Member } from "./users";

export const kitNameInput = z.string().trim().min(1, "Name is required").max(80);
export const createKitInput = z.object({ name: kitNameInput }).strict();
export const updateKitInput = z.object({ id: z.string(), name: kitNameInput, content: kitContentSchema }).strict();
export const kitIdInput = z.object({ id: z.string() }).strict();

function parseContent(text: string): KitContent {
  const parsed = kitContentSchema.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : DEFAULT_KIT_CONTENT;
}

async function kitAssets(orgId: string, kitIds: string[]) {
  if (kitIds.length === 0) return [];
  return db
    .select({ id: media.id, kitId: media.kitId, kind: media.assetKind, name: media.name, contentType: media.contentType })
    .from(media)
    .where(and(eq(media.orgId, orgId), eq(media.purpose, "kit"), inArray(media.kitId, kitIds)))
    .orderBy(media.createdAt);
}

export async function listKits(member: Member) {
  const rows = await db
    .select()
    .from(brandKits)
    .where(eq(brandKits.orgId, member.orgId))
    .orderBy(desc(brandKits.updatedAt));
  const assets = await kitAssets(member.orgId, rows.map((r) => r.id));
  return rows.map((row) => {
    const content = parseContent(row.content);
    const logo = assets.find((a) => a.kitId === row.id && a.kind === "logo");
    return { id: row.id, name: row.name, colors: content.colors, logoId: logo?.id ?? null };
  });
}

export async function getKit(member: Member, id: string): Promise<KitSnapshot> {
  const [row] = await db
    .select()
    .from(brandKits)
    .where(and(eq(brandKits.id, id), eq(brandKits.orgId, member.orgId)));
  if (!row) throw new NotFound("No brand kit with that id");
  const assets = await kitAssets(member.orgId, [id]);
  return {
    id: row.id,
    name: row.name,
    ...parseContent(row.content),
    assets: assets.map((a) => ({
      id: a.id,
      kind: (a.kind ?? "other") as KitSnapshot["assets"][number]["kind"],
      name: a.name,
      contentType: a.contentType,
    })),
  };
}

export async function createKit(member: Member, input: z.infer<typeof createKitInput>) {
  const id = crypto.randomUUID();
  await db.insert(brandKits).values({
    id,
    orgId: member.orgId,
    name: input.name,
    content: JSON.stringify(DEFAULT_KIT_CONTENT),
    createdBy: member.id,
    updatedAt: new Date().toISOString(),
  });
  return { id };
}

export async function updateKit(member: Member, input: z.infer<typeof updateKitInput>) {
  const [row] = await db
    .update(brandKits)
    .set({ name: input.name, content: JSON.stringify(input.content), updatedAt: new Date().toISOString() })
    .where(and(eq(brandKits.id, input.id), eq(brandKits.orgId, member.orgId)))
    .returning({ id: brandKits.id });
  if (!row) throw new NotFound("No brand kit with that id");
  return getKit(member, input.id);
}

/** Deletes the kit. Its files stay: videos made with it keep their copy of the kit. */
export async function deleteKit(member: Member, id: string) {
  const [row] = await db
    .delete(brandKits)
    .where(and(eq(brandKits.id, id), eq(brandKits.orgId, member.orgId)))
    .returning({ id: brandKits.id });
  if (!row) throw new NotFound("No brand kit with that id");
  return row;
}

export async function setAssetKind(member: Member, input: { id: string; kind: string }) {
  await db
    .update(media)
    .set({ assetKind: input.kind })
    .where(and(eq(media.id, input.id), eq(media.orgId, member.orgId), eq(media.purpose, "kit")));
}

/** Removes an asset from the kit. The file stays for videos that already use it. */
export async function removeAsset(member: Member, id: string) {
  await db
    .update(media)
    .set({ kitId: null })
    .where(and(eq(media.id, id), eq(media.orgId, member.orgId), eq(media.purpose, "kit")));
}

export async function kitExists(member: Member, id: string) {
  const [row] = await db
    .select({ id: brandKits.id })
    .from(brandKits)
    .where(and(eq(brandKits.id, id), eq(brandKits.orgId, member.orgId)));
  return !!row;
}
