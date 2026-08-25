import * as z from "zod";

export type HttpsUrl = `https://${string}`;

const httpsUrlTemplateSchema = z.templateLiteral(["https://", z.string()]);

export const createHttpsUrlSchema = () => z.url().pipe(httpsUrlTemplateSchema);

export const httpsUrlSchema = createHttpsUrlSchema();
