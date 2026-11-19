import { z } from 'zod';
import { isValidCpf, normalizeCpf } from '../utils/cpf.js';
import { isPassportCountry, isValidPassport, normalizePassport } from '../utils/document.js';

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
    // A passport in its stored shape (upper case, no separators), and the country that issued
    // it, which is asked for only with a passport and is never Brazil (ADR-010).
    passport: z
      .string()
      .trim()
      .max(40)
      .transform(normalizePassport)
      .refine((v) => v === '' || isValidPassport(v), { message: 'invalid_passport' })
      .optional()
      .or(z.literal('')),
    country: z.string().trim().toUpperCase().max(2).default('BR'),
    institution: z.string().trim().max(200).optional().or(z.literal('')),
    category: participantCategorySchema,
    modality: modalitySchema,
    consent: z.boolean().refine((v) => v, { message: 'consent_required' }),
  })
  .refine((data) => Boolean(data.cpf) || Boolean(data.passport), {
    message: 'cpf_or_passport_required',
    path: ['cpf'],
  })
  .refine((data) => !data.passport || isPassportCountry(data.country), {
    message: 'invalid_country',
    path: ['country'],
  })
  // Without a passport there is no country to keep: the column holds BR for everybody else.
  .transform((data) => ({ ...data, country: data.passport ? data.country : 'BR' }));

export type RegistrationFormData = z.input<typeof registrationSchema>;
