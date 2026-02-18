import { Router } from "express";
import { protectRoute } from "../../middleware/auths";
import { prisma } from "../../utils/prisma";
import { auth } from "../../utils/auth";
import { fromNodeHeaders } from "better-auth/node";
const router = Router();
/**
 * GET /api/auth-utils/verification-status - Check email verification status
 */
router.get("/verification-status", protectRoute, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                emailVerified: true,
                isActive: true
            }
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        res.json({
            success: true,
            data: {
                isVerified: !!user.emailVerified,
                email: user.email,
                isActive: user.isActive
            }
        });
    }
    catch (error) {
        console.error("Error checking verification status:", error);
        res.status(500).json({
            success: false,
            message: "Failed to check verification status"
        });
    }
});
/**
 * POST /api/auth-utils/resend-verification - Resend verification email
 */
router.post("/resend-verification", protectRoute, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                name: true,
                emailVerified: true
            }
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        if (user.emailVerified) {
            return res.status(400).json({
                success: false,
                message: "Email is already verified"
            });
        }
        // Check rate limiting (max 3 emails per hour)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentAttempts = await prisma.verificationRequest.count({
            where: {
                identifier: user.email,
                createdAt: {
                    gte: oneHourAgo
                }
            }
        });
        if (recentAttempts >= 3) {
            return res.status(429).json({
                success: false,
                message: "Too many verification emails sent. Please wait an hour before requesting again."
            });
        }
        // Generate new verification token and send email
        try {
            // Use Better Auth's internal API to send verification email
            const session = await auth.api.getSession({
                headers: fromNodeHeaders(req.headers),
            });
            if (!session) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid session"
                });
            }
            // Send verification email via Better Auth
            await auth.api.sendVerificationEmail({
                body: {
                    email: user.email,
                    callbackURL: `${process.env.FRONTEND_URL}/auth/verify-email`
                }
            });
            res.json({
                success: true,
                message: "Verification email sent successfully"
            });
        }
        catch (emailError) {
            console.error("Error sending verification email:", emailError);
            res.status(500).json({
                success: false,
                message: "Failed to send verification email"
            });
        }
    }
    catch (error) {
        console.error("Error resending verification:", error);
        res.status(500).json({
            success: false,
            message: "Failed to resend verification email"
        });
    }
});
/**
 * GET /api/auth-utils/profile-completion - Check if user profile is complete
 */
router.get("/profile-completion", protectRoute, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                profile: true
            }
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        const profile = user.profile;
        const completionChecks = {
            hasProfile: !!profile,
            hasFirstName: !!(profile?.firstName),
            hasLastName: !!(profile?.lastName),
            hasPhone: !!(profile?.phone),
            hasAddress: !!(profile?.address),
            emailVerified: !!user.emailVerified
        };
        const completedItems = Object.values(completionChecks).filter(Boolean).length;
        const totalItems = Object.keys(completionChecks).length;
        const completionPercentage = Math.round((completedItems / totalItems) * 100);
        const missingFields = Object.entries(completionChecks)
            .filter(([_, completed]) => !completed)
            .map(([field, _]) => field);
        res.json({
            success: true,
            data: {
                completionPercentage,
                isComplete: completionPercentage === 100,
                completedItems,
                totalItems,
                checks: completionChecks,
                missingFields,
                nextSteps: missingFields.map(field => {
                    const stepMap = {
                        hasProfile: "Complete your profile information",
                        hasFirstName: "Add your first name",
                        hasLastName: "Add your last name",
                        hasPhone: "Add your phone number",
                        hasAddress: "Add your address",
                        emailVerified: "Verify your email address"
                    };
                    return stepMap[field] || `Complete ${field}`;
                })
            }
        });
    }
    catch (error) {
        console.error("Error checking profile completion:", error);
        res.status(500).json({
            success: false,
            message: "Failed to check profile completion"
        });
    }
});
/**
 * GET /api/auth-utils/session-info - Get detailed session information
 */
router.get("/session-info", protectRoute, async (req, res) => {
    try {
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });
        if (!session) {
            return res.status(401).json({
                success: false,
                message: "No active session"
            });
        }
        // Get additional user data
        const userData = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
                id: true,
                email: true,
                role: true,
                isActive: true,
                emailVerified: true,
                createdAt: true,
                lastActiveAt: true,
                profile: {
                    select: {
                        firstName: true,
                        lastName: true,
                        avatar: true
                    }
                }
            }
        });
        res.json({
            success: true,
            data: {
                session: {
                    id: session.session.id,
                    userId: session.user.id,
                    expiresAt: session.session.expiresAt,
                    createdAt: session.session.createdAt
                },
                user: {
                    ...session.user,
                    ...userData,
                    fullName: userData?.profile
                        ? `${userData.profile.firstName || ''} ${userData.profile.lastName || ''}`.trim()
                        : session.user.name
                }
            }
        });
    }
    catch (error) {
        console.error("Error getting session info:", error);
        res.status(500).json({
            success: false,
            message: "Failed to get session information"
        });
    }
});
export default router;
