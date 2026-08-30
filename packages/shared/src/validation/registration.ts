import { z } from 'zod';
import { isValidCpf, normalizeCpf } from '../utils/cpf.js';

export const participantCategorySchema = z.enum([
  'ESTUDANTE_GRADUACAO',
  'ESTUDANTE_POS',
  'PROFESSOR',
  'PROFISSIONAL',
  'COMUNIDADE_UFCG',
]);

export const modalitySchema = z.enum(['PRESENCIAL', 'ONLINE']);

export const registrationSchema = z
  .object({
    fullName: z.string().trim().min(5).max(150),
    email: z.string().trim().email().max(200),
    cpf: z
      .string()
      .trim()
      .transform(normalizeCpf)
      .refine((v) => v === '' || isValidCpf(v), { message: 'invalid_cpf' })
      .optional()
      .or(z.literal('')),
    passport: z.string().trim().max(20).optional().or(z.literal('')),
    country: z.string().trim().length(2).default('BR'),
    institution: z.string().trim().max(200).optional().or(z.literal('')),
    category: participantCategorySchema,
    modality: modalitySchema,
    password: z.string().min(8).max(72),
  })
  .refine((data) => Boolean(data.cpf) || Boolean(data.passport), {
    message: 'cpf_or_passport_required',
    path: ['cpf'],
  });

export type RegistrationFormData = z.input<typeof registrationSchema>;
