import * as z from "zod";

export type ArtifactPath = string;
export type DirectoryPath = "/" | `/${string}/`;
export type PublicPath = `/${string}`;

const safeSegment = String.raw`(?!\.{1,2}(?:/|$))[A-Za-z0-9._~-]+`;

export const artifactPathSchema = z
  .string()
  .regex(new RegExp(`^(?:${safeSegment}/)*${safeSegment}$`, "u"))
  .transform((value): ArtifactPath => value);

export const directoryPathSchema = z
  .string()
  .regex(new RegExp(`^/(?:${safeSegment}/)*$`, "u"))
  .transform((value): DirectoryPath => value as DirectoryPath);

export const publicPathSchema = z
  .string()
  .regex(new RegExp(`^/(?:${safeSegment}/)*${safeSegment}$`, "u"))
  .transform((value): PublicPath => value as PublicPath);
