import { getEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { ZodError } from "zod";
import { rememberMember, toMember, type Member } from "./users";

/** The calling member on a server route, or null. Every route but share links is private, so null is rare. */
export async function routeMember(request: Request): Promise<Member | null> {
  const user = await getEveryAppUser(request, env);
  if (!user) return null;
  const member = toMember(user);
  await rememberMember(member);
  return member;
}

/** Runs a route handler as the member, turning known errors into JSON answers. */
export async function asMember(request: Request, work: (member: Member) => Promise<unknown>): Promise<Response> {
  const member = await routeMember(request);
  if (!member) return Response.json({ error: "Sign in through the Gateway" }, { status: 401 });
  try {
    const result = await work(member);
    if (result instanceof Response) return result;
    return Response.json(result ?? { ok: true });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    const status = (error as { status?: number }).status;
    if (status === 403 || status === 404 || status === 503) {
      return Response.json({ error: (error as Error).message }, { status });
    }
    throw error;
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
