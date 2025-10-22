import { z } from "zod";

export const contactFormSchema = z.object({
  email: z.string().email({ message: "Érvénytelen e-mail cím" }),
  message: z
    .string()
    .min(10, { message: "Legalább 10 karakter" })
    .max(2000, { message: "Legfeljebb 2000 karakter" }),
  // consent: true kötelező
  consent: z.boolean().refine(v => v === true, {
    message: "Szükséges hozzájárulás",
  }),
});

export type ContactForm = z.infer<typeof contactFormSchema>;
