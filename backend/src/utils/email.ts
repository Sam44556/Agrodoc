import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface EmailVerificationParams {
  to: string;
  subject: string;
  verificationUrl: string;
  userName?: string;
}

interface PasswordResetParams {
  to: string;
  subject: string;
  resetUrl: string;
  userName?: string;
}

export const sendVerificationEmail = async ({
  to,
  subject,
  verificationUrl,
  userName = 'there'
}: EmailVerificationParams) => {
  try {
    console.log('🔄 Attempting to send verification email to:', to);
    
    const { data, error } = await resend.emails.send({
      from: 'AgroTech <onboarding@resend.dev>', // Resend's test domain
      to: [to],
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #16a34a; margin: 0;">🌱 AgroTech</h1>
          </div>
          
          <h2 style="color: #333; margin-bottom: 20px;">Welcome to AgroTech!</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Hi ${userName},
          </p>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
            Thank you for joining AgroTech, your gateway to modern agricultural solutions. 
            To complete your registration and start connecting with farmers, buyers, and experts, 
            please verify your email address.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background: #16a34a; color: white; padding: 12px 30px; text-decoration: none; 
                      border-radius: 6px; font-weight: bold; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            If the button doesn't work, you can also copy and paste this link into your browser:
          </p>
          
          <p style="background: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all; 
                    font-size: 14px; color: #4b5563;">
            ${verificationUrl}
          </p>
          
          <p style="color: #666; line-height: 1.6; margin: 25px 0;">
            This verification link will expire in 24 hours for security purposes.
          </p>
          
          <hr style="border: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #9ca3af; font-size: 14px; text-align: center;">
            If you didn't create an account with AgroTech, you can safely ignore this email.
          </p>
          
          <p style="color: #9ca3af; font-size: 14px; text-align: center;">
            © 2026 AgroTech. All rights reserved.
          </p>
        </div>
      `
    });

    if (error) {
      console.error('❌ Error sending verification email:', error);
      throw new Error(`Failed to send verification email: ${error.message}`);
    }

    console.log('✅ Verification email sent successfully to:', to);
    console.log('📧 Email ID:', data?.id);
    return data;

  } catch (error) {
    console.error('Error in sendVerificationEmail:', error);
    throw error;
  }
};

export const sendResetPasswordEmail = async ({
  to,
  subject,
  resetUrl,
  userName = 'there'
}: PasswordResetParams) => {
  try {
    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'AgroTech <noreply@agrotech.com>',
      to: [to],
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #16a34a; margin: 0;">🌱 AgroTech</h1>
          </div>
          
          <h2 style="color: #333; margin-bottom: 20px;">Password Reset Request</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Hi ${userName},
          </p>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
            We received a request to reset the password for your AgroTech account. 
            If you made this request, click the button below to create a new password.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background: #dc2626; color: white; padding: 12px 30px; text-decoration: none; 
                      border-radius: 6px; font-weight: bold; display: inline-block;">
              Reset Password
            </a>
          </div>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            If the button doesn't work, you can also copy and paste this link into your browser:
          </p>
          
          <p style="background: #f3f4f6; padding: 10px; border-radius: 4px; word-break: break-all; 
                    font-size: 14px; color: #4b5563;">
            ${resetUrl}
          </p>
          
          <p style="color: #666; line-height: 1.6; margin: 25px 0;">
            This reset link will expire in 1 hour for security purposes.
          </p>
          
          <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; 
                      padding: 15px; margin: 25px 0;">
            <p style="color: #92400e; margin: 0; font-weight: bold;">
              ⚠️ Security Notice
            </p>
            <p style="color: #92400e; margin: 10px 0 0 0; font-size: 14px;">
              If you didn't request a password reset, please ignore this email. 
              Your password will remain unchanged.
            </p>
          </div>
          
          <hr style="border: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #9ca3af; font-size: 14px; text-align: center;">
            For security reasons, we recommend using a strong, unique password.
          </p>
          
          <p style="color: #9ca3af; font-size: 14px; text-align: center;">
            © 2026 AgroTech. All rights reserved.
          </p>
        </div>
      `
    });

    if (error) {
      console.error('Error sending password reset email:', error);
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }

    console.log('📧 Password reset email sent successfully:', data?.id);
    return data;

  } catch (error) {
    console.error('Error in sendResetPasswordEmail:', error);
    throw error;
  }
};

export const sendWelcomeEmail = async (to: string, userName: string, userRole: string) => {
  try {
    const roleMessages = {
      FARMER: 'Start showcasing your produce and connect with buyers directly.',
      BUYER: 'Discover fresh, quality produce from local farmers.',
      EXPERT: 'Share your expertise and help the farming community grow.',
      ADMIN: 'Manage and oversee the AgroTech platform.'
    };

    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'AgroTech <welcome@agrotech.com>',
      to: [to],
      subject: `Welcome to AgroTech, ${userName}! 🌱`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #16a34a; margin: 0;">🌱 AgroTech</h1>
          </div>
          
          <h2 style="color: #333; margin-bottom: 20px;">Welcome to AgroTech!</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Hi ${userName},
          </p>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 25px;">
            Congratulations! Your email has been verified and your AgroTech account is now active.
            ${roleMessages[userRole as keyof typeof roleMessages] || 'Welcome to the AgroTech community!'}
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" 
               style="background: #16a34a; color: white; padding: 12px 30px; text-decoration: none; 
                      border-radius: 6px; font-weight: bold; display: inline-block;">
              Get Started
            </a>
          </div>
          
          <p style="color: #666; line-height: 1.6; margin: 25px 0;">
            Thank you for joining our mission to revolutionize agriculture through technology.
          </p>
          
          <hr style="border: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #9ca3af; font-size: 14px; text-align: center;">
            Need help? Contact us at support@agrotech.com
          </p>
          
          <p style="color: #9ca3af; font-size: 14px; text-align: center;">
            © 2026 AgroTech. All rights reserved.
          </p>
        </div>
      `
    });

    if (error) {
      console.error('Error sending welcome email:', error);
      throw new Error(`Failed to send welcome email: ${error.message}`);
    }

    console.log('📧 Welcome email sent successfully:', data?.id);
    return data;

  } catch (error) {
    console.error('Error in sendWelcomeEmail:', error);
    throw error;
  }
};