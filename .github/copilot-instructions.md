# Repository instructions

- Keep the existing desktop and mobile design unless a change explicitly requests a redesign.
- Use Next.js App Router and preserve static export compatibility with GitHub Pages.
- Keep display content and external URLs in `src/config` and validate untrusted boundaries with Zod.
- Prefer React Server Components; add client components only when browser state or effects are necessary.
- Use `ExternalLink` for external navigation and preserve tab-isolation attributes.
- Run `pnpm check` for code changes and `pnpm validate` before handoff.
- Never update visual snapshots to hide an unexplained rendering difference.
