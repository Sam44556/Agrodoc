import { Router } from "express";
import { adminOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";
import bcrypt from "bcryptjs";
const router = Router();
/**
 * GET /api/admin/profile - Get admin profile
 */
router.get("/", adminOnlyRoute, async (req, res) => {
    try {
        const adminId = req.user.id;
        const admin = await prisma.user.findUnique({
            where: { id: adminId },
            select: {
                id: true,
                email: true,
                role: true,
                isActive: true,
                isVerified: true,
                createdAt: true,
                lastActiveAt: true,
                profile: true
            }
        });
        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin profile not found"
            });
        }
        // Get admin activity statistics
        const [totalUsers, totalOrders, totalProducts, recentActions] = await Promise.all([
            prisma.user.count(),
            prisma.order.count(),
            prisma.produce.count(),
            prisma.systemLog.count({
                where: {
                    userId: adminId,
                    createdAt: {
                        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
                    }
                }
            })
        ]);
        res.json({
            success: true,
            data: {
                ...admin,
                statistics: {
                    totalUsers,
                    totalOrders,
                    totalProducts,
                    recentActions
                }
            }
        });
    }
    catch (error) {
        console.error("Error fetching admin profile:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch admin profile"
        });
    }
});
/**
 * PUT /api/admin/profile - Update admin profile
 */
router.put("/", adminOnlyRoute, async (req, res) => {
    try {
        const adminId = req.user.id;
        const { email, profile: profileData } = req.body;
        // Check if email is being changed and if it's already in use
        if (email) {
            const existingUser = await prisma.user.findFirst({
                where: {
                    email,
                    id: { not: adminId }
                }
            });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: "Email is already in use by another user"
                });
            }
        }
        // Update user email if provided
        const updateData = {};
        if (email)
            updateData.email = email;
        const updatedUser = await prisma.user.update({
            where: { id: adminId },
            data: updateData
        });
        // Update or create profile if provided
        let updatedProfile = null;
        if (profileData) {
            updatedProfile = await prisma.profile.upsert({
                where: { userId: adminId },
                update: {
                    firstName: profileData.firstName || undefined,
                    lastName: profileData.lastName || undefined,
                    phone: profileData.phone || undefined,
                    address: profileData.address || undefined,
                    avatar: profileData.avatar || undefined
                },
                create: {
                    userId: adminId,
                    firstName: profileData.firstName || '',
                    lastName: profileData.lastName || '',
                    phone: profileData.phone || '',
                    address: profileData.address || '',
                    avatar: profileData.avatar || ''
                }
            });
        }
        // Fetch updated admin data
        const admin = await prisma.user.findUnique({
            where: { id: adminId },
            select: {
                id: true,
                email: true,
                role: true,
                isActive: true,
                isVerified: true,
                createdAt: true,
                lastActiveAt: true,
                profile: true
            }
        });
        res.json({
            success: true,
            message: "Profile updated successfully",
            data: admin
        });
    }
    catch (error) {
        console.error("Error updating admin profile:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update admin profile"
        });
    }
});
/**
 * PATCH /api/admin/profile/password - Change admin password
 */
router.patch("/password", adminOnlyRoute, async (req, res) => {
    try {
        const adminId = req.user.id;
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Current password and new password are required"
            });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "New password must be at least 6 characters long"
            });
        }
        // Get current admin with password
        const admin = await prisma.user.findUnique({
            where: { id: adminId }
        });
        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found"
            });
        }
        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, admin.password);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({
                success: false,
                message: "Current password is incorrect"
            });
        }
        // Hash new password
        const hashedNewPassword = await bcrypt.hash(newPassword, 12);
        // Update password
        await prisma.user.update({
            where: { id: adminId },
            data: {
                password: hashedNewPassword
            }
        });
        res.json({
            success: true,
            message: "Password updated successfully"
        });
    }
    catch (error) {
        console.error("Error updating admin password:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update password"
        });
    }
});
export default router;
