// Edge function: stripe-return
//
// Public landing page Stripe Connect onboarding redirects to when a user
// finishes (or refreshes a stale link). It must be HTTPS — Stripe rejects
// custom URL schemes — and it must be reachable without auth, since
// Stripe loads it inside the in-app browser without our bearer token.
//
// We can't deep-link directly into the app from here (Stripe won't allow
// arbitrary schemes in return_url), so the page just tells the user to
// close the window. The wallet screen's useFocusEffect refetches Stripe
// status as soon as the in-app browser dismisses, picking up the new
// state automatically.
//
// `?refresh=1` query param signals the user hit Stripe's "refresh"
// path (typically because the AccountLink expired). We surface a
// slightly different message so they understand what happened.

Deno.serve((req) => {
  const url = new URL(req.url);
  const isRefresh = url.searchParams.has("refresh");

  const heading = isRefresh ? "Onboarding link expired" : "Setup complete";
  const message = isRefresh
    ? "Your Stripe link timed out. Tap the X above to return to PotKeeper, then start onboarding again."
    : "You can now return to PotKeeper. Tap the X in the top-left to close this window.";
  const icon = isRefresh ? "&#x23F3;" : "&#x2713;";
  const iconColor = isRefresh ? "#F59E0B" : "#22C55E";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0A0A0F">
  <title>PotKeeper</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      background: #FAFAFA;
      color: #0A0A0F;
    }
    @media (prefers-color-scheme: dark) {
      html, body { background: #0A0A0F; color: #FAFAFA; }
      .sub { color: #94a3b8; }
      .card { background: #18181b; border-color: rgba(255,255,255,0.06); }
    }
    main {
      min-height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px env(safe-area-inset-bottom, 24px);
      text-align: center;
    }
    .badge {
      width: 96px;
      height: 96px;
      border-radius: 28px;
      background: ${iconColor}1f;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
      font-size: 48px;
      color: ${iconColor};
      font-weight: 700;
    }
    h1 {
      font-size: 26px;
      font-weight: 700;
      margin: 0 0 12px;
      letter-spacing: -0.01em;
    }
    .sub {
      color: #475569;
      max-width: 320px;
      line-height: 1.5;
      font-size: 15px;
      margin: 0 0 28px;
    }
    .card {
      border: 1px solid rgba(0,0,0,0.06);
      background: rgba(255,255,255,0.6);
      border-radius: 14px;
      padding: 12px 16px;
      font-size: 13px;
      color: #64748b;
      max-width: 340px;
    }
    .brand { font-weight: 600; color: #22C55E; }
  </style>
</head>
<body>
  <main>
    <div class="badge" aria-hidden="true">${icon}</div>
    <h1>${heading}</h1>
    <p class="sub">${message}</p>
    <div class="card">
      We'll auto-refresh your payout status the moment you're back in
      <span class="brand">PotKeeper</span>.
    </div>
  </main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      // nosniff forces the browser to honor our Content-Type instead of
      // MIME-sniffing the body. iOS SFSafariViewController otherwise had
      // a habit of falling back to "view source" mode for this URL — most
      // likely interaction between our previous `default-src 'self'` CSP
      // and Stripe's redirect chain. We drop the CSP/X-Frame-Options
      // since this is a static thank-you page with no scripts to protect.
      "X-Content-Type-Options": "nosniff",
    },
  });
});
