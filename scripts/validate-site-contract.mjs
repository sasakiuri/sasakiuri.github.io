#!/usr/bin/env node

import { readFile } from "node:fs/promises";

import { assertSiteContractMatchesSchema } from "./lib/site-contract-json-schema.mjs";

const [contract, schema] = await Promise.all(
  ["../config/site-contract.json", "../config/site-contract.schema.json"].map(async (relativePath) =>
    JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8")),
  ),
);

assertSiteContractMatchesSchema({ contract, schema });
process.stdout.write("Validated config/site-contract.json against its draft 2020-12 schema.\n");
