import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

function secret() {
  return new TextEncoder().encode(process.env.APP_PASSWORD ?? "");
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth_token")?.value;
  if (!token) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    await jwtVerify(token, secret());
    return NextResponse.json({ authenticated: true });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
