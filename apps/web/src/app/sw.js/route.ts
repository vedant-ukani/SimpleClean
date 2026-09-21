import { createServiceWorkerSource } from "../../lib/pwa-cache-policy";

export const dynamic = "force-static";

export function GET() {
  return new Response(createServiceWorkerSource(), {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Type": "text/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
