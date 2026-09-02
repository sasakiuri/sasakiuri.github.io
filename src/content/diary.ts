import * as z from "zod";

import rawDiaryData from "./diary.json";

import { safeExternalHttpsUrlSchema } from "@/config/https-url-schema";

const diaryPostSchema = z
  .strictObject({
    id: z.string().regex(/^[1-9]\d{5,24}$/u),
    publishedAt: z.iso.datetime(),
    text: z.string().trim().min(1),
    url: safeExternalHttpsUrlSchema,
  })
  .readonly();

const diaryDataSchema = z
  .strictObject({
    posts: z.array(diaryPostSchema).min(1).readonly(),
    source: z
      .strictObject({
        profileUrl: z.literal("https://x.com/sasakiuri"),
        username: z.literal("sasakiuri"),
      })
      .readonly(),
    version: z.literal(1),
  })
  .readonly();

export const diaryData = diaryDataSchema.parse(rawDiaryData);
