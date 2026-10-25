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

// Pre-registration (#149): no password until accounts exist (#14). The LGPD
// consent is required because the row holds a CPF and is kept until the event.
export const registrationSchema = z
  .object({
    fullName: z.string().trim().min(5).max(150),
    email: z.string().trim().toLowerCase().email().max(200),
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
    consent: z.boolean().refine((v) => v, { message: 'consent_required' }),
  })
  .refine((data) => Boolean(data.cpf) || Boolean(data.passport), {
    message: 'cpf_or_passport_required',
    path: ['cpf'],
  });

export type RegistrationFormData = z.input<typeof registrationSchema>;
