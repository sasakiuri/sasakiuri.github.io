import type { ComponentPropsWithoutRef } from "react";

import type { HttpsUrl } from "@/config/site";

type ExternalLinkProps = Omit<
  ComponentPropsWithoutRef<"a">,
  "href" | "rel" | "target"
> & {
  readonly href: HttpsUrl;
};

export function ExternalLink({ children, href, ...props }: ExternalLinkProps) {
  return (
    <a {...props} href={href} rel="noreferrer noopener" target="_blank">
      {children}
    </a>
  );
}
