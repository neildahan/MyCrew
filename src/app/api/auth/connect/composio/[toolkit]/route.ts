import { NextRequest, NextResponse } from "next/server";
import { startConnection } from "@/lib/tools/composio";
import { getCrewNumbers } from "@/lib/crew";

export const dynamic = "force-dynamic";

/**
 * Begin connecting an account (Outlook, Gmail, …) for one crew member.
 *
 *   /api/auth/connect/composio/outlook            -> first crew member
 *   /api/auth/connect/composio/outlook?user=9725… -> a specific one
 *
 * Connections are scoped per crew member, so Neil and Inbal each connect their
 * own mailbox and neither can read the other's.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ toolkit: string }> }
) {
  const { toolkit } = await params;
  const crew = await getCrewNumbers();
  const requested = request.nextUrl.searchParams.get("user");

  const userId = requested ?? crew[0];
  if (!userId) {
    return NextResponse.json({ error: "No crew members configured" }, { status: 500 });
  }
  // Only ever connect an account for someone already in the crew: this URL
  // would otherwise let anyone attach their mailbox to the assistant.
  if (!crew.includes(userId)) {
    return NextResponse.json({ error: "Not a crew member" }, { status: 403 });
  }

  const url = await startConnection(userId, toolkit);
  if (!url) {
    return NextResponse.json(
      {
        error: `Could not start the ${toolkit} connection`,
        hint: "Set composio_api_key in the settings table.",
      },
      { status: 500 }
    );
  }

  return NextResponse.redirect(url);
}
