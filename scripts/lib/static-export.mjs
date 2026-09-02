import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function collectFiles(rootDirectory) {
  const entries = await readdir(rootDirectory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(rootDirectory, entry.name);

      if (entry.isSymbolicLink()) {
        throw new TypeError(`Static exports must not contain symbolic links: ${absolutePath}`);
      }

      if (entry.isDirectory()) {
        return collectFiles(absolutePath);
      }

      if (!entry.isFile()) {
        throw new TypeError(`Static exports may contain regular files only: ${absolutePath}`);
      }

      return [absolutePath];
    }),
  );

  return nested.flat().sort();
}

export function digest(buffer, encoding = "hex") {
  return createHash("sha256").update(buffer).digest(encoding);
}

export function digestSha1(buffer) {
  return createHash("sha1").update(buffer).digest("hex");
}

export async function readUtf8(filePath) {
  return readFile(filePath, "utf8");
}

export function toPosixPath(rootDirectory, filePath) {
  return path.relative(rootDirectory, filePath).split(path.sep).join("/");
}
