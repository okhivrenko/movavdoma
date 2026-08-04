export function privacyPolicyPage({ brandName, effectiveDate, content }) {
    return `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, follow">
  <title>Політика конфіденційності — ${brandName}</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #16243a; background: #f6f8fb; }
    body { margin: 0; padding: 32px 16px; }
    main { max-width: 760px; margin: 0 auto; padding: 42px; background: #fff; border: 1px solid #dce4ef; border-radius: 20px; box-shadow: 0 12px 35px rgba(31, 52, 81, .08); }
    h1 { margin: 0 0 8px; font-size: 32px; } h2 { margin-top: 32px; font-size: 21px; } p, li { color: #40516a; line-height: 1.6; } .date { color: #66758b; margin-top: 0; } strong { color: #16243a; } code { padding: 2px 5px; background: #edf2f8; border-radius: 4px; }
  </style>
</head>
<body><main>
  <h1>Privacy Policy for ${brandName}</h1>
  <p class="date">${content.effectiveDate(effectiveDate)}</p>
  ${content.body(brandName)}
</main></body></html>`;
}
