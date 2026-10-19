import { z } from 'zod';

/**
 * Destino telefônico tipado para originação outbound (formato E.164).
 * Valida apenas a forma do número: não afirma que o número existe, está
 * disponível ou é discável. A normalização de entrada livre pertence a
 * slices futuras de contatos.
 */
export const E164_DESTINATION_PATTERN = /^\+[1-9]\d{7,14}$/;

export const e164DestinationSchema = z
  .string()
  .regex(E164_DESTINATION_PATTERN, 'Destino deve estar no formato E.164.')
  .brand<'E164Destination'>();

export type E164Destination = z.infer<typeof e164DestinationSchema>;
