import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export function assertSiteContractMatchesSchema({ contract, schema }) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: true });
  addFormats(ajv);

  if (!ajv.validateSchema(schema)) {
    throw new TypeError(`Site contract schema is invalid:\n${formatErrors(ajv.errors)}`);
  }

  const validate = ajv.compile(schema);
  if (!validate(contract)) {
    throw new TypeError(`Site contract does not match its JSON Schema:\n${formatErrors(validate.errors)}`);
  }
}

function formatErrors(errors = []) {
  return errors
    .map(({ instancePath, keyword, message }) => `${instancePath || "/"} [${keyword}] ${message ?? "failed"}`)
    .join("\n");
}
