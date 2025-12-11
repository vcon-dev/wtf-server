import { z } from "zod";

/** Civic address schema */
export const CivicAddressSchema = z
  .object({
    country: z.string().optional(),
    a1: z.string().optional(),
    a2: z.string().optional(),
    a3: z.string().optional(),
    a4: z.string().optional(),
    a5: z.string().optional(),
    a6: z.string().optional(),
    prd: z.string().optional(),
    pod: z.string().optional(),
    sts: z.string().optional(),
    hno: z.string().optional(),
    hns: z.string().optional(),
    lmk: z.string().optional(),
    loc: z.string().optional(),
    flr: z.string().optional(),
    nam: z.string().optional(),
    pc: z.string().optional(),
  })
  .strict();

/** Party role enum */
export const PartyRoleSchema = z.enum([
  "agent",
  "customer",
  "supervisor",
  "sme",
  "thirdparty",
]);

/** Party schema */
export const PartySchema = z
  .object({
    tel: z.string().optional(),
    mailto: z.string().email().optional(),
    name: z.string().optional(),
    stir: z.string().optional(),
    validation: z.string().optional(),
    uuid: z.string().uuid().optional(),
    role: PartyRoleSchema.optional(),
    gmlpos: z.string().optional(),
    civicaddress: CivicAddressSchema.optional(),
    timezone: z.string().optional(),
    contact_list: z.string().optional(),
  })
  .passthrough();

/** Dialog type enum */
export const DialogTypeSchema = z.enum([
  "recording",
  "text",
  "transfer",
  "incomplete",
]);

/** Encoding type enum */
export const EncodingSchema = z.enum(["base64url", "json", "none"]);

/** Party history event schema */
export const PartyHistoryEventSchema = z.object({
  event: z.enum(["join", "drop", "hold", "unhold", "mute", "unmute"]),
  party: z.number().int().nonnegative(),
  time: z.string().datetime(),
});

/** Dialog schema */
export const DialogSchema = z
  .object({
    type: DialogTypeSchema,
    start: z.string().datetime(),
    duration: z.number().nonnegative().optional(),
    parties: z.union([
      z.number().int().nonnegative(),
      z.array(z.number().int().nonnegative()),
    ]),
    originator: z.number().int().nonnegative().optional(),
    mediatype: z.string().optional(),
    filename: z.string().optional(),
    body: z.string().optional(),
    encoding: EncodingSchema.optional(),
    url: z.string().url().optional(),
    content_hash: z.union([z.string(), z.array(z.string())]).optional(),
    disposition: z.string().optional(),
    party_history: z.array(PartyHistoryEventSchema).optional(),
    campaign: z.string().optional(),
    interaction_type: z.string().optional(),
    interaction_id: z.string().optional(),
    skill: z.string().optional(),
    application: z.string().optional(),
    message_id: z.string().optional(),
    // Transfer-specific fields
    transferee: z.number().int().nonnegative().optional(),
    transferor: z.number().int().nonnegative().optional(),
    transfer_target: z.number().int().nonnegative().optional(),
    original: z.number().int().nonnegative().optional(),
    consultation: z.number().int().nonnegative().optional(),
    target_dialog: z.number().int().nonnegative().optional(),
  })
  .passthrough()
  .refine(
    (data) => {
      // If type is recording or text with inline content, mediatype is required
      if ((data.type === "recording" || data.type === "text") && data.body) {
        return !!data.mediatype;
      }
      return true;
    },
    { message: "mediatype is required when body is present for recording/text" }
  );

/** Analysis type enum */
export const AnalysisTypeSchema = z.enum([
  "summary",
  "transcript",
  "translation",
  "sentiment",
  "tts",
  "wtf_transcription",
]);

/** Analysis schema */
export const AnalysisSchema = z
  .object({
    type: z.union([AnalysisTypeSchema, z.string()]),
    dialog: z
      .union([z.number().int().nonnegative(), z.array(z.number().int().nonnegative())])
      .optional(),
    mediatype: z.string().optional(),
    filename: z.string().optional(),
    vendor: z.string().min(1),
    product: z.string().optional(),
    schema: z.string().optional(),
    body: z.union([z.string(), z.record(z.unknown())]).optional(),
    encoding: EncodingSchema.optional(),
    url: z.string().url().optional(),
    content_hash: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .passthrough();

/** Attachment schema */
export const AttachmentSchema = z
  .object({
    type: z.string().optional(),
    start: z.string().datetime().optional(),
    party: z.number().int().nonnegative().optional(),
    mediatype: z.string().min(1),
    filename: z.string().optional(),
    body: z.string().optional(),
    encoding: EncodingSchema.optional(),
    url: z.string().url().optional(),
    content_hash: z.union([z.string(), z.array(z.string())]).optional(),
    dialog: z.number().int().nonnegative().optional(),
  })
  .passthrough();

/** VCON group schema */
export const VconGroupSchema = z.object({
  uuid: z.string().uuid(),
  vcon: z.lazy(() => VconSchema).optional(),
  url: z.string().url().optional(),
});

/** Redacted reference schema */
export const RedactedSchema = z.object({
  uuid: z.string().uuid(),
  vcon: z.lazy(() => VconSchema).optional(),
  url: z.string().url().optional(),
});

/** Appended reference schema */
export const AppendedSchema = z.object({
  uuid: z.string().uuid(),
  vcon: z.lazy(() => VconSchema).optional(),
  url: z.string().url().optional(),
});

/** Main VCON schema */
export const VconSchema: z.ZodType = z
  .object({
    vcon: z.string().regex(/^\d+\.\d+\.\d+$/, "Invalid version format"),
    uuid: z.string().uuid(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime().optional(),
    subject: z.string().optional(),
    parties: z.array(PartySchema).min(1),
    dialog: z.array(DialogSchema).optional(),
    analysis: z.array(AnalysisSchema).optional(),
    attachments: z.array(AttachmentSchema).optional(),
    group: z.array(VconGroupSchema).optional(),
    redacted: RedactedSchema.optional(),
    appended: AppendedSchema.optional(),
  })
  .passthrough()
  .refine(
    (data) => {
      // group, redacted, and appended are mutually exclusive
      const count = [data.group, data.redacted, data.appended].filter(
        Boolean
      ).length;
      return count <= 1;
    },
    { message: "group, redacted, and appended are mutually exclusive" }
  );

/** Type inference helpers */
export type VconInput = z.input<typeof VconSchema>;
export type VconOutput = z.output<typeof VconSchema>;
