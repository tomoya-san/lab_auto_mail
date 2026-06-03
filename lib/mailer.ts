import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

let _transport: Transporter | null = null;

function transport(): Transporter {
  if (_transport) return _transport;
  const port = env.smtp.port();
  _transport = nodemailer.createTransport({
    host: env.smtp.host(),
    port,
    secure: port === 465,
    auth: {
      user: env.smtp.user(),
      pass: env.smtp.pass(),
    },
  });
  return _transport;
}

export async function sendEmail({
  subject,
  body,
}: {
  subject: string;
  body: string;
}): Promise<{ id: string }> {
  const info = await transport().sendMail({
    from: env.smtp.from(),
    to: env.emailRecipient(),
    subject,
    text: body,
  });
  return { id: info.messageId };
}
