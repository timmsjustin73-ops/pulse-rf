import nodemailer from "nodemailer";

function transport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !to) return false;
  await transport().sendMail({ from: `RF Pulse Jesus <${process.env.SMTP_USER}>`, to, subject, text });
  return true;
}

export async function testSmtp(): Promise<{ ok: boolean; error: string }> {
  try {
    await transport().verify();
    return { ok: true, error: "" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "SMTP connection failed";
    return { ok: false, error: message.replace(/pass(word)?[=:]\S+/gi, "password=hidden") };
  }
}
