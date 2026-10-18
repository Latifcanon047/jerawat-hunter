export interface SendPasswordResetEmailParams {
  email: string;
  resetUrl: string;
}

export interface SendEmailResult {
  sent: boolean;
  reason?: "NOT_CONFIGURED" | "API_ERROR" | "NETWORK_ERROR";
}

/**
 * Mengirimkan email tautan pemulihan kata sandi.
 * Jika provider email (Resend) belum dikonfigurasi di environment,
 * fungsi akan mengembalikan status sent: false secara aman tanpa error fatal.
 */
export async function sendPasswordResetEmail({
  email,
  resetUrl,
}: SendPasswordResetEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Provider email belum dikonfigurasi di lingkungan ini
    return {
      sent: false,
      reason: "NOT_CONFIGURED",
    };
  }

  try {
    const fromAddress =
      process.env.EMAIL_FROM || "Jerawat Hunter <onboarding@resend.dev>";

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: email,
        subject: "Atur Ulang Kata Sandi Akun Jerawat Hunter",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #171717;">
            <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Atur Ulang Kata Sandi</h2>
            <p style="font-size: 14px; line-height: 1.6; color: #525252;">
              Kami menerima permintaan untuk mengatur ulang kata sandi akun Jerawat Hunter Anda. Klik tombol di bawah ini untuk melanjutkan:
            </p>
            <div style="margin: 24px 0;">
              <a href="${resetUrl}" style="background-color: #059669; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 14px; display: inline-block;">
                Atur Ulang Kata Sandi
              </a>
            </div>
            <p style="font-size: 13px; line-height: 1.6; color: #737373;">
              Tautan ini berlaku selama 60 menit. Jika Anda tidak meminta pengaturan ulang kata sandi, Anda dapat mengabaikan email ini dengan aman.
            </p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      return {
        sent: false,
        reason: "API_ERROR",
      };
    }

    return {
      sent: true,
    };
  } catch {
    return {
      sent: false,
      reason: "NETWORK_ERROR",
    };
  }
}
