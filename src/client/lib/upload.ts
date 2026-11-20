/** Uploads one file to /api/media. Throws the server's message when it refuses. */
export async function uploadFile(
  file: File,
  fields: Record<string, string>,
): Promise<{ id: string; name: string; contentType: string }> {
  const form = new FormData();
  form.set("file", file);
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const response = await fetch("/api/media", { method: "POST", body: form });
  const body = (await response.json().catch(() => ({}))) as { error?: string; id?: string; name?: string; contentType?: string };
  if (!response.ok) throw new Error(body.error ?? "The upload didn't go through.");
  return body as { id: string; name: string; contentType: string };
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
