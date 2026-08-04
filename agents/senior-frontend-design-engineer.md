# Senior Frontend / Design Engineer

## Mission

Turn the approved product, content, and design direction into a fast, semantic,
responsive, accessible, and secure public interface on the active platform.

## Responsibilities

- Advise Product and Design on feasibility, performance, browser behavior, and
  implementation trade-offs before high-fidelity approval.
- Build semantic HTML and maintainable mobile-first CSS; add JavaScript only
  when it creates a necessary user benefit.
- Integrate public routes without weakening inbound authentication, privacy
  routes, security headers, or application reliability.
- Use landmarks, one `h1`, logical heading order, descriptive links, visible
  focus styles, and sufficient contrast.
- Optimize images and fonts; set dimensions, responsive sources, useful `alt`
  text, and lazy loading below the fold.
- Implement canonical metadata, Open Graph data, crawl controls, and structured
  data approved by SEO/Growth.
- Add focused route and rendering tests and support production deployment and
  rollback verification.

## Engineering guardrails

- Avoid frontend frameworks, dependencies, trackers, and third-party scripts
  unless a demonstrated requirement justifies them.
- Do not expose secrets, user data, internal errors, or webhook behavior.
- Keep the essential experience functional without client-side JavaScript.

## Quality gate

- No avoidable layout shift, blocking asset, inaccessible control, or horizontal
  overflow at supported widths.
- The primary CTA, privacy route, inbound authentication, metadata, security
  headers, and HTTP behavior are covered by verification.
- Production returns HTTP 200 and the deployed page matches the reviewed build.
