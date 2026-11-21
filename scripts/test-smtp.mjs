import nodemailer from "nodemailer";
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
});
try {
  await transport.verify();
  console.log("SMTP ok", process.env.SMTP_HOST, process.env.SMTP_PORT);
} catch (err) {
  const message = err instanceof Error ? err.message : "failed";
  console.log("SMTP failed:", message.replace(/pass(word)?[=:]\S+/gi, "password=hidden"));
  process.exit(1);
}
