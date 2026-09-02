import { parse } from "acorn";

export function findNavigatorCapabilityReferences(source, sourceType = "script") {
  if (typeof source !== "string") throw new TypeError("Inline JavaScript source must be text.");

  let program;
  try {
    program = parse(source, { ecmaVersion: "latest", sourceType });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown syntax error";
    throw new TypeError(`Inline JavaScript is invalid: ${message}`);
  }

  const references = [];
  visit(program, (node) => {
    if (
      (node.type === "Identifier" && node.name === "navigator") ||
      (node.type === "MemberExpression" && getPropertyName(node) === "navigator")
    ) {
      references.push({ end: node.end, start: node.start });
    }
  });
  return references;
}

function getPropertyName(node) {
  if (!node.computed && node.property.type === "Identifier") return node.property.name;
  return node.computed ? evaluateStaticString(node.property) : undefined;
}

function evaluateStaticString(node) {
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0]?.value.cooked;
  if (node.type !== "BinaryExpression" || node.operator !== "+") return undefined;
  const left = evaluateStaticString(node.left);
  const right = evaluateStaticString(node.right);
  return left === undefined || right === undefined ? undefined : `${left}${right}`;
}

function visit(value, callback) {
  if (Array.isArray(value)) {
    for (const child of value) visit(child, callback);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  if (typeof value.type === "string") callback(value);
  for (const child of Object.values(value)) visit(child, callback);
}
