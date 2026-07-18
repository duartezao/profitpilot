import { authErrorResponse, requireUser } from "@/lib/require-auth";
import { getWorkspaceRevision } from "@/lib/workspace-revision";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POLL_MS = 15_000;

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const workspaceId = user.workspaceId;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let lastRev = "";
        let closed = false;

        const push = (rev: string, force = false) => {
          if (closed) return;
          if (force || rev !== lastRev) {
            lastRev = rev;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ rev })}\n\n`),
            );
          } else {
            controller.enqueue(encoder.encode(": ping\n\n"));
          }
        };

        const tick = async () => {
          if (closed) return;
          try {
            const rev = await getWorkspaceRevision(workspaceId);
            push(rev);
          } catch {
            closed = true;
            clearInterval(timer);
            controller.close();
          }
        };

        const initial = await getWorkspaceRevision(workspaceId);
        push(initial, true);

        const timer = setInterval(() => {
          void tick();
        }, POLL_MS);

        request.signal.addEventListener("abort", () => {
          closed = true;
          clearInterval(timer);
          try {
            controller.close();
          } catch {
            /* já fechado */
          }
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
