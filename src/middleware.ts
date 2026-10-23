import { NextResponse } from "next/server";

/**
 * The app doesn't use Next's image optimizer, so its endpoint is closed: it
 * has had serious security flaws (e.g. GHSA-2464-fhr4-w9xw) and isn't needed.
 */
export function middleware() {
  return new NextResponse("Not found", { status: 404 });
}

export const config = { matcher: ["/_next/image"] };
