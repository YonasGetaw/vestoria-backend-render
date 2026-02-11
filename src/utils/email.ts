import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
});

export async function sendPasswordResetEmail(params: { to: string; resetUrl: string }): Promise<void> {
  try {
    if (!env.SMTP_USER || !env.SMTP_PASS) {
      console.warn("SMTP credentials not configured. Email sending disabled.");
      // In development, you might want to log the reset URL instead
      if (env.NODE_ENV === "development") {
        console.log(`Password reset URL for ${params.to}: ${params.resetUrl}`);
      }
      return;
    }

    await transporter.sendMail({
      from: `${env.SMTP_FROM_NAME} <${env.SMTP_FROM_EMAIL}>`,
      to: params.to,
      subject: "Reset your Vestoria password",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5">
          <h2>Password Reset</h2>
          <p>Click the link below to reset your password:</p>
          <p><a href="${params.resetUrl}">${params.resetUrl}</a></p>
          <p>If you didn't request this, you can ignore this email.</p>
          <p>This link will expire in 30 minutes.</p>
        </div>
      `
    });
  } catch (error) {
    console.error("Failed to send password reset email:", error);
    // In development, don't throw the error to prevent blocking the flow
    if (env.NODE_ENV === "production") {
      throw error;
    } else {
      console.log(`Password reset URL for ${params.to}: ${params.resetUrl}`);
    }
  }
}
