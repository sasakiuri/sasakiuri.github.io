import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExternalLink } from "./external-link";

describe("ExternalLink", () => {
  it("opens an HTTPS URL in a separate, isolated tab", () => {
    render(
      <ExternalLink className="test-link" href="https://example.com/path">
        Example
      </ExternalLink>,
    );

    expect(screen.getByRole("link", { name: "Example" })).toEqual(
      expect.objectContaining({
        className: "test-link",
        href: "https://example.com/path",
        rel: "noreferrer noopener",
        target: "_blank",
      }),
    );
  });
});
