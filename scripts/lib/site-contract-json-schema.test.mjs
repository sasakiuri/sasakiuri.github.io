import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { assertSiteContractMatchesSchema } from "./site-contract-json-schema.mjs";

const contract = JSON.parse(readFileSync(path.join(process.cwd(), "config/site-contract.json"), "utf8"));
const schema = JSON.parse(readFileSync(path.join(process.cwd(), "config/site-contract.schema.json"), "utf8"));

describe("site contract JSON Schema", () => {
  it("validates the authoritative contract instance", () => {
    expect(() => assertSiteContractMatchesSchema({ contract, schema })).not.toThrow();
  });

  it.each([
    ["unknown properties", (candidate) => (candidate.unknown = true)],
    ["a missing schema declaration", (candidate) => delete candidate.$schema],
    ["an invalid canonical URL", (candidate) => (candidate.routes.personal.url = "http://slithy.net/sasakiuri/")],
  ])("rejects %s", (_label, mutate) => {
    const candidate = structuredClone(contract);
    mutate(candidate);

    expect(() => assertSiteContractMatchesSchema({ contract: candidate, schema })).toThrow(
      /does not match its JSON Schema/u,
    );
  });
});
