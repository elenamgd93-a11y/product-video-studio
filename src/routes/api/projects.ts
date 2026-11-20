import { createFileRoute } from "@tanstack/react-router";
import { asMember } from "@/server/http";
import * as projects from "@/server/projects";

/** The projects the caller can see, and a new one. */
export const Route = createFileRoute("/api/projects")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) =>
        asMember(request, async (member) => ({ projects: await projects.listProjects(member) })),
      POST: ({ request }: { request: Request }) =>
        asMember(request, async (member) =>
          Response.json(await projects.createProject(member, projects.createProjectInput.parse(await request.json())), {
            status: 201,
          }),
        ),
    },
  },
});
