import nodemailer, { Transporter } from 'nodemailer';
import { Sender } from '@prisma/client';
import { prisma } from '../config/prisma.js';

import { EmailAttachment } from '../queues/email.queue.js';

export interface SendEmailOptions {
  sender: Sender;
  recipient: string;
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  messageId: string;
  previewUrl: string | false;
  response: string;
  senderEmail: string;
  recipient: string;
}

// In-memory cache for transporters per senderId to avoid recreating connections unnecessarily
const transporterCache = new Map<string, Transporter>();

export class EmailService {
  /**
   * Retrieves or constructs a Nodemailer Transporter for a specific sender.
   * If credentials are not explicitly set or are placeholders, automatically creates
   * an Ethereal test account and updates the sender record in PostgreSQL.
   */
  public static async getTransporter(sender: Sender): Promise<Transporter> {
    const cached = transporterCache.get(sender.id);
    if (cached) {
      return cached;
    }

    let host = sender.smtpHost;
    let port = sender.smtpPort || 587;
    let user = sender.smtpUser;
    let pass = sender.smtpPass;

    const isPlaceholder = !user || !pass || user.startsWith('ethereal_user_');

    if (isPlaceholder) {
      console.log(`✨ Creating dynamic Ethereal test account for sender "${sender.displayName}" (${sender.email})...`);
      const testAccount = await nodemailer.createTestAccount();
      host = testAccount.smtp.host;
      port = testAccount.smtp.port;
      user = testAccount.user;
      pass = testAccount.pass;

      // Persist newly generated Ethereal credentials back to the database for this sender
      await prisma.sender.update({
        where: { id: sender.id },
        data: {
          smtpHost: host,
          smtpPort: port,
          smtpUser: user,
          smtpPass: pass,
          smtpSecure: testAccount.smtp.secure,
        },
      });
      console.log(`✅ Dynamically provisioned Ethereal account: ${user}`);
    }

    const transporter = nodemailer.createTransport({
      host: host || 'smtp.ethereal.email',
      port: port || 587,
      secure: sender.smtpSecure || false,
      auth: {
        user: user!,
        pass: pass!,
      },
    });

    transporterCache.set(sender.id, transporter);
    return transporter;
  }

  /**
   * Sends an email via SMTP using Nodemailer and captures the Ethereal message preview URL.
   */
  public static async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const { sender, recipient, subject, body } = options;

    const transporter = await this.getTransporter(sender);

    const fromAddress = sender.displayName
      ? `"${sender.displayName}" <${sender.email}>`
      : sender.email;

    try {
      const mailOptions: any = {
        from: fromAddress,
        to: recipient,
        subject,
        html: body,
        text: body.replace(/<[^>]*>?/gm, ''), // fallback plain text
      };

      if (options.attachments && options.attachments.length > 0) {
        mailOptions.attachments = options.attachments.map((att) => ({
          filename: att.filename,
          content: Buffer.from(att.content, 'base64'),
          contentType: att.contentType,
        }));
      }

      const info = await transporter.sendMail(mailOptions);

      const previewUrl = nodemailer.getTestMessageUrl(info);

      console.log(`📧 [EmailService] Successfully delivered email "${subject}" to ${recipient}`);
      if (previewUrl) {
        console.log(`🔗 [Ethereal Preview URL]: ${previewUrl}`);
      }

      return {
        messageId: info.messageId || 'unknown-id',
        previewUrl,
        response: info.response || 'OK',
        senderEmail: sender.email,
        recipient,
      };
    } catch (error) {
      const normalizedMsg = this.normalizeError(error);
      console.error(`❌ [EmailService] SMTP delivery failed to ${recipient}: ${normalizedMsg}`);
      throw new Error(`SMTP Delivery Failed: ${normalizedMsg}`);
    }
  }

  /**
   * Normalizes arbitrary errors into clean, readable descriptions
   */
  public static normalizeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown SMTP transmission error';
  }
}
