import { createMiddleware } from "@tanstack/react-start";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { rememberMember, toMember } from "@/server/users";

/** The signed-in member, recorded on first sight, as `context.member`. */
export const memberMiddleware = createMiddleware({ type: "function" })
  .middleware([ensureUserMiddleware])
  .server(async ({ next, context }) => {
    const member = toMember(context.user);
    await rememberMember(member);
    return next({ context: { member } });
  });
