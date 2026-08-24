import * as z from "zod";

export type HttpsUrl = `https://${string}`;

export const createHttpsUrlSchema = () => z.url({ protocol: /^https$/ });

export const httpsUrlSchema = createHttpsUrlSchema();
