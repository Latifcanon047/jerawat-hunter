import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .email("Format email tidak valid")
  .max(255, "Email maksimal 255 karakter")
  .transform((val) => val.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, "Password minimal 8 karakter")
  .max(128, "Password maksimal 128 karakter");

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .max(100, "Nama maksimal 100 karakter")
    .optional()
    .transform((val) => (val && val.length > 0 ? val : undefined)),
  email: emailSchema,
  password: passwordSchema,
});

export const registerFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .max(100, "Nama maksimal 100 karakter")
      .optional()
      .transform((val) => (val && val.length > 0 ? val : undefined)),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Konfirmasi kata sandi wajib diisi"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Konfirmasi kata sandi tidak cocok",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Password tidak boleh kosong")
    .max(128, "Password maksimal 128 karakter"),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Token pemulihan tidak valid"),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Konfirmasi kata sandi wajib diisi"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Konfirmasi kata sandi tidak cocok",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type RegisterFormInput = z.infer<typeof registerFormSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
