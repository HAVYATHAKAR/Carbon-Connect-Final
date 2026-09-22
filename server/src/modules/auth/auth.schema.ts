import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().optional(),
  organizationLegalName: z.string().min(2).max(200),
  organizationDisplayName: z.string().min(2).max(200),
  organizationType: z.enum(['buyer', 'seller', 'buyer_seller']),
  role: z.enum(['BUYER_ADMIN', 'SELLER_ADMIN']),
  state: z.string().min(2),
  city: z.string().min(2),
  registeredAddress: z.string().min(5),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(10),
  gstin: z.string().optional(),
  cin: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
