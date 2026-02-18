import { Router, Request, Response } from "express";
import { farmerOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";
import bcrypt from "bcryptjs";

const router = Router();

/**
 * GET /api/farmer/settings - Get user settings and preferences
 */
router.get("/", farmerOnlyRoute, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    // Get or create user settings
    let settings = await prisma.userSettings.findUnique({
      where: { userId }
    });

    // If no settings exist, create default settings
    if (!settings) {
      settings = await prisma.userSettings.create({
        data: {
          userId,
          // Default values will be used from schema
        }
      });
    }

    // Get user basic info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        location: true,
        image: true,
        createdAt: true
      }
    });

    res.json({
      success: true,
      data: {
        user,
        settings
      }
    });

  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch settings"
    });
  }
});

/**
 * PUT /api/farmer/settings - Update notification and privacy settings
 */
router.put("/", farmerOnlyRoute, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const {
      // Notification settings
      emailNotifications,
      pushNotifications,
      smsNotifications,
      marketAlerts,
      orderUpdates,
      chatMessages,
      weeklyReports,
      
      // Privacy settings
      profileVisibility,
      showContactInfo,
      showLocation,
      allowDirectMessages,
      dataCollectionConsent,
      
      // App settings
      language,
      timezone,
      currency,
      theme,
      
      // Security settings
      twoFactorEnabled,
      loginNotifications,
      sessionTimeout
    } = req.body;

    // Validate profile visibility
    const validVisibility = ['PUBLIC', 'PRIVATE', 'BUYERS_ONLY'];
    if (profileVisibility && !validVisibility.includes(profileVisibility)) {
      return res.status(400).json({
        success: false,
        message: "Invalid profile visibility value"
      });
    }

    // Validate theme
    const validThemes = ['light', 'dark', 'auto'];
    if (theme && !validThemes.includes(theme)) {
      return res.status(400).json({
        success: false,
        message: "Invalid theme value"
      });
    }

    // Validate session timeout (5 minutes to 8 hours)
    if (sessionTimeout && (sessionTimeout < 5 || sessionTimeout > 480)) {
      return res.status(400).json({
        success: false,
        message: "Session timeout must be between 5 and 480 minutes"
      });
    }

    // Update or create settings
    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: {
        // Only update fields that were provided
        ...(emailNotifications !== undefined && { emailNotifications }),
        ...(pushNotifications !== undefined && { pushNotifications }),
        ...(smsNotifications !== undefined && { smsNotifications }),
        ...(marketAlerts !== undefined && { marketAlerts }),
        ...(orderUpdates !== undefined && { orderUpdates }),
        ...(chatMessages !== undefined && { chatMessages }),
        ...(weeklyReports !== undefined && { weeklyReports }),
        
        ...(profileVisibility !== undefined && { profileVisibility }),
        ...(showContactInfo !== undefined && { showContactInfo }),
        ...(showLocation !== undefined && { showLocation }),
        ...(allowDirectMessages !== undefined && { allowDirectMessages }),
        ...(dataCollectionConsent !== undefined && { dataCollectionConsent }),
        
        ...(language !== undefined && { language }),
        ...(timezone !== undefined && { timezone }),
        ...(currency !== undefined && { currency }),
        ...(theme !== undefined && { theme }),
        
        ...(twoFactorEnabled !== undefined && { twoFactorEnabled }),
        ...(loginNotifications !== undefined && { loginNotifications }),
        ...(sessionTimeout !== undefined && { sessionTimeout }),
        
        updatedAt: new Date()
      },
      create: {
        userId,
        emailNotifications: emailNotifications ?? true,
        pushNotifications: pushNotifications ?? true,
        smsNotifications: smsNotifications ?? false,
        marketAlerts: marketAlerts ?? true,
        orderUpdates: orderUpdates ?? true,
        chatMessages: chatMessages ?? true,
        weeklyReports: weeklyReports ?? true,
        
        profileVisibility: profileVisibility ?? 'PUBLIC',
        showContactInfo: showContactInfo ?? true,
        showLocation: showLocation ?? true,
        allowDirectMessages: allowDirectMessages ?? true,
        dataCollectionConsent: dataCollectionConsent ?? true,
        
        language: language ?? 'en',
        timezone: timezone ?? 'Africa/Addis_Ababa',
        currency: currency ?? 'ETB',
        theme: theme ?? 'light',
        
        twoFactorEnabled: twoFactorEnabled ?? false,
        loginNotifications: loginNotifications ?? true,
        sessionTimeout: sessionTimeout ?? 30
      }
    });

    res.json({
      success: true,
      message: "Settings updated successfully",
      data: settings
    });

  } catch (error) {
    console.error("Error updating settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update settings"
    });
  }
});

/**
 * PATCH /api/farmer/settings/password - Change user password
 */
router.patch("/password", farmerOnlyRoute, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password, new password, and confirmation are required"
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "New password and confirmation do not match"
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters long"
      });
    }

    // Get user's current password hash
    const account = await prisma.account.findFirst({
      where: {
        userId,
        providerId: "credential" // For email/password accounts
      },
      select: {
        id: true,
        password: true
      }
    });

    if (!account || !account.password) {
      return res.status(400).json({
        success: false,
        message: "No password found for this account"
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, account.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect"
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await prisma.account.update({
      where: { id: account.id },
      data: {
        password: hashedNewPassword,
        updatedAt: new Date()
      }
    });

    // Log security event
    console.log(`Password changed for user ${userId} at ${new Date().toISOString()}`);

    res.json({
      success: true,
      message: "Password changed successfully"
    });

  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({
      success: false,
      message: "Failed to change password"
    });
  }
});

/**
 * DELETE /api/farmer/account - Delete user account (soft delete)
 */
router.delete("/account", farmerOnlyRoute, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { password, confirmation } = req.body;

    // Validate input
    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required to delete account"
      });
    }

    if (confirmation !== "DELETE MY ACCOUNT") {
      return res.status(400).json({
        success: false,
        message: "Please type 'DELETE MY ACCOUNT' to confirm account deletion"
      });
    }

    // Verify password
    const account = await prisma.account.findFirst({
      where: {
        userId,
        providerId: "credential"
      },
      select: {
        password: true
      }
    });

    if (!account || !account.password) {
      return res.status(400).json({
        success: false,
        message: "Cannot verify password for account deletion"
      });
    }

    const isPasswordValid = await bcrypt.compare(password, account.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Incorrect password"
      });
    }

    // Get user info before deletion for logging
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true
      }
    });

    // Perform soft delete by anonymizing user data
    const deletedAt = new Date();
    const randomSuffix = Math.random().toString(36).substring(2, 8);

    await prisma.user.update({
      where: { id: userId },
      data: {
        email: `deleted_${randomSuffix}@deleted.com`,
        name: `Deleted User ${randomSuffix}`,
        phone: null,
        location: null,
        image: null,
        emailVerified: false,
        updatedAt: deletedAt
      }
    });

    // Delete sensitive data
    await prisma.account.deleteMany({
      where: { userId }
    });

    await prisma.session.deleteMany({
      where: { userId }
    });

    await prisma.userSettings.deleteMany({
      where: { userId }
    });

    // Log security event
    console.log(`Account deleted for user ${user?.email} (${user?.name}) at ${deletedAt.toISOString()}`);

    res.json({
      success: true,
      message: "Account deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete account"
    });
  }
});

export default router;