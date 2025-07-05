import { randomUUID } from "node:crypto";
import { Email, type User, db } from "app/api";
import { EmailParams, MailerSend, Recipient, Sender } from "mailersend";

const mailerSend = process.env.MAILERSEND_API_KEY
  ? new MailerSend({ apiKey: process.env.MAILERSEND_API_KEY })
  : undefined;

if (mailerSend && !process.env.MAILERSEND_PASSWORD_RESET_TEMPLATE_ID) {
  throw new Error(
    "The MAILERSEND_API_KEY is defined, but MAILERSEND_PASSWORD_RESET_TEMPLATE_ID is not",
  );
}
if (mailerSend && !process.env.MAILERSEND_VERIFICATION_TEMPLATE_ID) {
  throw new Error(
    "The MAILERSEND_API_KEY is defined, but MAILERSEND_VERIFICATION_TEMPLATE_ID is not",
  );
}

const sentFrom = new Sender("no-reply@chattriggers.com", "ChatTriggers");

export const sendEmail = async (recipient: string, params: EmailParams) => {
  if (!mailerSend) {
    console.log("Warning: sendEmail invoked without mailersend environment variables configured");
    return;
  }

  const existingBounceOrComplaint = await db.email.findFirst({
    where: {
      recipient,
      type: {
        in: ["bounce", "complaint"],
      },
    },
  });

  if (existingBounceOrComplaint) return;

  params.setFrom(sentFrom).setTo([new Recipient(recipient)]);
  await mailerSend.email.send(params);
};

export const sendPasswordResetEmail = async (user: User) => {
  if (!mailerSend) {
    console.log(
      "Warning: sendPasswordResetEmail invoked without mailersend environment variables configured",
    );
    return;
  }

  const passwordResetToken = randomUUID();
  await db.user.update({
    where: { id: user.id },
    data: { password_reset_token: passwordResetToken },
  });

  const params = new EmailParams()
    .setTemplateId(process.env.MAILERSEND_PASSWORD_RESET_TEMPLATE_ID ?? "unreachable")
    .setPersonalization([
      {
        email: user.email,
        data: {
          name: user.name,
          reset_link: `${process.env.NEXT_PUBLIC_WEB_ROOT}/auth/resetpassword?token=${passwordResetToken}`,
        },
      },
    ]);

  return await sendEmail(user.email, params);
};

export const sendVerificationEmail = async (user: User) => {
  if (!mailerSend) {
    console.log(
      "Warning: sendVerificationEmail invoked without mailersend environment variables configured",
    );
    return;
  }

  const verificationToken = randomUUID();
  await db.user.update({
    where: { id: user.id },
    data: { verification_token: verificationToken },
  });

  const params = new EmailParams()
    .setTemplateId(process.env.MAILERSEND_VERIFICATION_TEMPLATE_ID ?? "unreachable")
    .setPersonalization([
      {
        email: user.email,
        data: {
          name: user.name,
          verification_link: `${process.env.NEXT_PUBLIC_WEB_ROOT}/users/${user.name}/verify?token=${verificationToken}`,
        },
      },
    ]);

  return await sendEmail(user.email, params);
};

export { EmailParams, Recipient };
