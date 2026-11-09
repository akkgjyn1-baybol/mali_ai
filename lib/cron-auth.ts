export function assertCronAuth(req: Request) {
  const authHeader = req.headers.get("authorization");
  const querySecret = new URL(req.url).searchParams.get("secret");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${secret}` && querySecret !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
