import { cookies } from "next/headers";
import { getUser } from "./db";
import type { User } from "./types";
import { isUuid } from "./utils";

export const USER_COOKIE = "mirror_user_id";

export async function getSessionUserId() {
  const store = cookies();
  const fromCookie = store.get(USER_COOKIE)?.value;
  if (fromCookie && isUuid(fromCookie)) return fromCookie;
  return null;
}

export async function getSessionUser() {
  const id = await getSessionUserId();
  if (!id) return null;
  return getUser(id);
}

export function setUserCookie(userId: string) {
  cookies().set(USER_COOKIE, userId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}

export async function requireUser(): Promise<
  | { user: User; error: null }
  | { user: null; error: Response }
> {
  const user = await getSessionUser();
  if (!user) {
    return {
      user: null,
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user, error: null };
}
