import { z } from "zod";
import { USERNAME_REGEX } from "@/lib/auth/username";

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
export type LoginInput = z.infer<typeof loginSchema>;

export const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  displayName: z.string().trim().max(60).optional(),
  isAdmin: z.boolean().optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().max(60).optional(),
  bio: z.string().trim().max(280).optional(),
  avatarUrl: z.string().url().optional().or(z.literal("")),
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
