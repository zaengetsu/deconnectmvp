import { z } from 'zod';
import { MIN_CHILD_AGE, MAX_CHILD_AGE } from './constants';

// ─── Auth Schemas ────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
});

export const registerSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
  confirmPassword: z.string().min(6, 'Confirmation requise'),
  fullName: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword'],
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Email invalide'),
});

// ─── Child Schemas ───────────────────────────────────────────
export const childSchema = z.object({
  display_name: z.string()
    .min(2, 'Le prénom doit contenir au moins 2 caractères')
    .max(20, 'Le prénom ne peut pas dépasser 20 caractères'),
  age: z.number()
    .int('L\'âge doit être un nombre entier')
    .min(MIN_CHILD_AGE, `L'âge minimum est ${MIN_CHILD_AGE} ans`)
    .max(MAX_CHILD_AGE, `L'âge maximum est ${MAX_CHILD_AGE} ans`),
  avatar_url: z.string().optional(),
});

export const childPinSchema = z.object({
  pin: z.string().length(4, 'Le code doit contenir 4 chiffres').regex(/^\d{4}$/, 'Le code doit contenir uniquement des chiffres'),
});

// ─── Activity Schemas ────────────────────────────────────────
export const activitySchema = z.object({
  title: z.string().min(3, 'Le titre doit contenir au moins 3 caractères').max(100, 'Le titre ne peut pas dépasser 100 caractères'),
  description: z.string().max(500, 'La description ne peut pas dépasser 500 caractères').optional(),
  instructions: z.string().max(1000, 'Les instructions ne peuvent pas dépasser 1000 caractères').optional(),
  points: z.number().int().min(1, 'Les points doivent être au moins 1').max(100, 'Les points ne peuvent pas dépasser 100'),
  duration_minutes: z.number().int().min(5, 'La durée minimum est 5 minutes').max(180, 'La durée maximum est 3 heures').optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  category_id: z.string().uuid().optional(),
});

// ─── Reward Schemas ──────────────────────────────────────────
export const rewardSchema = z.object({
  title: z.string().min(3, 'Le titre doit contenir au moins 3 caractères').max(100, 'Le titre ne peut pas dépasser 100 caractères'),
  description: z.string().max(500, 'La description ne peut pas dépasser 500 caractères').optional(),
  required_points: z.number().int().min(10, 'Il faut au moins 10 points').max(1000, 'Maximum 1000 points'),
  child_id: z.string().uuid().optional(),
});

// ─── Validation Schemas ──────────────────────────────────────
export const validationSchema = z.object({
  parent_note: z.string().max(200, 'La note ne peut pas dépasser 200 caractères').optional(),
});

export const rejectionSchema = z.object({
  rejection_reason: z.string().min(3, 'Veuillez donner une raison').max(200, 'La raison ne peut pas dépasser 200 caractères'),
});

// ─── Types from schemas ──────────────────────────────────────
export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
export type ChildFormData = z.infer<typeof childSchema>;
export type ChildPinFormData = z.infer<typeof childPinSchema>;
export type ActivityFormData = z.infer<typeof activitySchema>;
export type RewardFormData = z.infer<typeof rewardSchema>;
export type ValidationFormData = z.infer<typeof validationSchema>;
export type RejectionFormData = z.infer<typeof rejectionSchema>;
