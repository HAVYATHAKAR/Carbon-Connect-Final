import { env } from '../../config/env.js';

interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

class EmailService {
  async send(msg: EmailMessage): Promise<void> {
    if (env.EMAIL_PROVIDER === 'console') {
      console.log(`\n📧 [EMAIL - console mode]\nTo: ${msg.to}\nSubject: ${msg.subject}\n---\n${msg.text}\n---\n`);
      return;
    }
    // TODO: Implement smtp / sendgrid / ses adapters
    console.warn(`[EMAIL] Provider '${env.EMAIL_PROVIDER}' not configured; falling back to console`);
    console.log(`📧 To: ${msg.to} | Subject: ${msg.subject}`);
  }

  async sendPasswordReset(email: string, token: string, firstName: string): Promise<void> {
    const resetUrl = `${env.FRONTEND_ORIGIN}/reset-password?token=${token}`;
    await this.send({
      to: email,
      subject: 'Reset your Carbon-Connect password',
      text: `Hi ${firstName},\n\nClick the link below to reset your password (expires in 1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
    });
  }

  async sendEmailVerification(email: string, token: string, firstName: string): Promise<void> {
    const verifyUrl = `${env.FRONTEND_ORIGIN}/verify-email?token=${token}`;
    await this.send({
      to: email,
      subject: 'Verify your Carbon-Connect email address',
      text: `Hi ${firstName},\n\nPlease verify your email address:\n\n${verifyUrl}\n\nLink expires in 24 hours.`,
    });
  }

  async sendBidAwardedNotification(email: string, supplierName: string, rfqTitle: string, contractCode: string): Promise<void> {
    await this.send({
      to: email,
      subject: `Your bid has been awarded — ${rfqTitle}`,
      text: `Dear ${supplierName},\n\nYour bid for "${rfqTitle}" has been awarded.\nContract: ${contractCode}\n\nLog in to Carbon-Connect to review and sign the contract.\n\nThis is a physical CO₂ supply transaction.`,
    });
  }

  async sendBidDeclinedNotification(email: string, supplierName: string, rfqTitle: string): Promise<void> {
    await this.send({
      to: email,
      subject: `Bid not selected — ${rfqTitle}`,
      text: `Dear ${supplierName},\n\nThank you for your bid on "${rfqTitle}". The buyer has selected another supplier for this requirement.\n\nMore opportunities are available on the Carbon-Connect marketplace.`,
    });
  }
}

export const emailService = new EmailService();
