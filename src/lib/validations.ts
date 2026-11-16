import { z } from "zod";
import { USERNAME_REGEX } from "@/lib/auth/username";
import { DISPLAY_NAME_RE } from "@/lib/entry-checks";
import { isMojiValue } from "@/lib/moji";
import { isCompleteSignupCode } from "@/lib/signup-code";

export const usernameSchema = z
  .string()
  .min(3, "At least 3 characters")
  .max(24, "At most 24 characters")
  .regex(USERNAME_REGEX, "Lowercase letters, numbers, and underscores only");

export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(128, "Too long");

export const loginSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const gatePasswordSchema = z
  .string()
  .min(4, "At least 4 characters")
  .max(128, "Too long");

export const createUserSchema = z.object({
  username: usernameSchema,
  password: gatePasswordSchema,
  displayName: z.string().trim().max(60).optional(),
  isAdmin: z.boolean().optional(),
});

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().max(60).optional(),
  bio: z.string().trim().max(280).optional(),
  avatarUrl: z
    .string()
    .max(500)
    .refine((v) => v === "" || isMojiValue(v) || /^https:\/\/\S+$/.test(v), "Not a valid avatar")
    .optional(),
});

export const messageInputSchema = z
  .object({
    content: z.string().trim().max(4000).optional(),
    attachmentUrl: z.string().url().optional(),
    attachmentName: z.string().max(200).optional(),
    attachmentSize: z.number().int().nonnegative().optional(),
    attachmentMime: z.string().max(120).optional(),
    type: z.enum(["text", "image", "file"]).default("text"),
    replyTo: z.string().uuid().optional(),
  })
  .refine((v) => (v.content && v.content.length > 0) || v.attachmentUrl, {
    message: "Message is empty",
    path: ["content"],
  });

export const vanishSchema = z.object({
  upTo: z
    .string()
    .max(40)
    .refine((value) => !Number.isNaN(Date.parse(value)), "Not a time"),
});

export const createDirectChatSchema = z.object({
  kind: z.literal("direct"),
  otherUserId: z.string().uuid(),
});

export const createGroupChatSchema = z.object({
  kind: z.literal("group"),
  name: z.string().trim().min(1).max(60),
  memberIds: z.array(z.string().uuid()).min(1).max(50),
});

export const createChatSchema = z.discriminatedUnion("kind", [
  createDirectChatSchema,
  createGroupChatSchema,
]);

export const createRoomSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  chatEnabled: z.boolean().optional(),
  voiceEnabled: z.boolean().optional(),
  videoEnabled: z.boolean().optional(),
  maxParticipants: z.number().int().min(2).max(500).optional(),
  expiresInMinutes: z.number().int().min(1).max(60 * 24 * 30).optional(),
});

export const updateRoomSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  chatEnabled: z.boolean().optional(),
  voiceEnabled: z.boolean().optional(),
  videoEnabled: z.boolean().optional(),
  maxParticipants: z.number().int().min(2).max(500).nullable().optional(),
  status: z.enum(["active", "ended", "locked"]).optional(),
});

export const createInviteSchema = z.object({
  label: z.string().trim().max(60).optional(),
  expiresInMinutes: z.number().int().min(1).max(60 * 24 * 30).nullable().optional(),
  maxUses: z.number().int().min(1).max(1000).nullable().optional(),
});

export const displayNameSchema = z
  .string()
  .trim()
  .max(40, "Keep it under 40 characters")
  .regex(DISPLAY_NAME_RE, "Please use a simpler name")
  .transform((s) => s.replace(/\s+/g, " "));

export const joinRoomSchema = z.object({
  code: z.string().trim().min(8).max(200),
  displayName: z
    .union([displayNameSchema, z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export const updateParticipantSchema = z
  .object({
    blocked: z.boolean().optional(),
    canChat: z.boolean().optional(),
    canVoice: z.boolean().optional(),
    canVideo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const signupSchema = z.object({
  code: z
    .string()
    .trim()
    .max(40)
    .refine(isCompleteSignupCode, "Enter all 10 characters of your invite code"),
  username: usernameSchema,
  password: passwordSchema,
  displayName: z
    .union([displayNameSchema, z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  avatar: z.string().max(60).refine(isMojiValue, "Pick an avatar from the list").optional(),
});

export const createSignupCodeSchema = z.object({
  label: z.string().trim().max(60).optional(),
  maxUses: z.number().int().min(1).max(100).optional(),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});
