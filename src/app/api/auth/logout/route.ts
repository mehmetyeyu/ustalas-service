import { NextResponse } from "next/server";
import { UI_PREF_COOKIE } from "@/lib/uiThemeBoot";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("auth_token");
  response.cookies.delete(UI_PREF_COOKIE);
  return response;
}
