import { Router } from "express";
import { adminOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";
import bcrypt from "bcryptjs";
const router = Router();
/**
 * GET /api/admin/users - Get all users with filtering and pagination
 */
router.get("/", adminOnlyRoute, async (req, res) => {
    try {
        const { role = 'all', status = 'all', search, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const where = {};
        // Apply filters
        if (role !== 'all') {
            where.role = role;
        }
        if (status !== 'all') {
            where.isActive = status === 'active';
        }
        if (search) {
            where.OR = [
                { email: { contains: search, mode: 'insensitive' } },
                {
                    profile: {
                        OR: [
                            { firstName: { contains: search, mode: 'insensitive' } },
                            { lastName: { contains: search, mode: 'insensitive' } },
                            { phone: { contains: search, mode: 'insensitive' } }
                        ]
                    }
                }
            ];
        }
        const orderBy = {};
        orderBy[sortBy] = sortOrder;
        const [users, totalCount] = await Promise.all([
            prisma.user.findMany({
                where,
                orderBy,
                skip,
                take: parseInt(limit),
                select: {
                    id: true,
                    email: true,
                    role: true,
                    isActive: true,
                    isVerified: true,
                    createdAt: true,
                    lastActiveAt: true,
                    profile: {
                        select: {
                            firstName: true,
                            lastName: true,
                            phone: true,
                            address: true,
                            avatar: true
                        }
                    },
                    _count: {
                        select: {
                            farmerProduce: true,
                            buyerOrders: true
                        }
                    }
                }
            }),
            prisma.user.count({ where })
        ]);
        // Get role statistics
        const roleStats = await prisma.user.groupBy({
            by: ['role'],
            _count: { role: true }
        });
        res.json({
            success: true,
            data: {
                users,
                pagination: {
                    current: parseInt(page),
                    total: Math.ceil(totalCount / parseInt(limit)),
                    hasNext: skip + parseInt(limit) < totalCount,
                    totalCount
                },
                statistics: {
                    total: totalCount,
                    byRole: roleStats.reduce((acc, stat) => {
                        acc[stat.role] = stat._count.role;
                        return acc;
                    }, {})
                }
            }
        });
    }
    catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch users"
        });
    }
});
/**
 * GET /api/admin/users/:id - Get specific user details
 */
router.get("/:id", adminOnlyRoute, async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                profile: true,
                farmerProduce: {
                    select: {
                        id: true,
                        name: true,
                        price: true,
                        status: true,
                        createdAt: true
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 5
                },
                buyerOrders: {
                    select: {
                        id: true,
                        total: true,
                        status: true,
                        createdAt: true
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 5
                },
                _count: {
                    select: {
                        farmerProduce: true,
                        buyerOrders: true,
                        reviews: true
                    }
                }
            }
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        // Calculate user statistics based on role
        let additionalStats = {};
        if (user.role === 'FARMER') {
            const farmerStats = await prisma.produce.aggregate({
                where: { farmerId: userId },
                _sum: { stock: true },
                _avg: { price: true }
            });
            additionalStats = {
                totalStock: farmerStats._sum.stock || 0,
                averagePrice: farmerStats._avg.price || 0
            };
        }
        if (user.role === 'BUYER') {
            const buyerStats = await prisma.order.aggregate({
                where: { buyerId: userId, status: 'COMPLETED' },
                _sum: { total: true },
                _count: { id: true }
            });
            additionalStats = {
                totalSpent: buyerStats._sum.total || 0,
                completedOrders: buyerStats._count || 0
            };
        }
        if (user.role === 'EXPERT') {
            const expertStats = await Promise.all([
                prisma.article.count({
                    where: { authorId: userId, isPublished: true }
                }),
                prisma.article.aggregate({
                    where: { authorId: userId, isPublished: true },
                    _avg: { viewCount: true }
                })
            ]);
            additionalStats = {
                publishedArticles: expertStats[0],
                averageViews: expertStats[1]._avg.viewCount || 0
            };
        }
        res.json({
            success: true,
            data: {
                ...user,
                statistics: additionalStats
            }
        });
    }
    catch (error) {
        console.error("Error fetching user details:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch user details"
        });
    }
});
/**
 * POST /api/admin/users - Create new user
 */
router.post("/", adminOnlyRoute, async (req, res) => {
    try {
        const { email, password, role, profile } = req.body;
        // Validate required fields
        if (!email || !password || !role) {
            return res.status(400).json({
                success: false,
                message: "Email, password, and role are required"
            });
        }
        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User with this email already exists"
            });
        }
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);
        // Create user with profile
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                role,
                isActive: true,
                isVerified: true, // Admin created users are auto-verified
                profile: profile ? {
                    create: {
                        firstName: profile.firstName || '',
                        lastName: profile.lastName || '',
                        phone: profile.phone || '',
                        address: profile.address || ''
                    }
                } : undefined
            },
            include: {
                profile: true
            }
        });
        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;
        res.status(201).json({
            success: true,
            message: "User created successfully",
            data: userWithoutPassword
        });
    }
    catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create user"
        });
    }
});
/**
 * PUT /api/admin/users/:id - Update user
 */
router.put("/:id", adminOnlyRoute, async (req, res) => {
    try {
        const userId = req.params.id;
        const adminId = req.user.id;
        const { email, role, isActive, isVerified, profile } = req.body;
        // Prevent admin from deactivating themselves
        if (userId === adminId && isActive === false) {
            return res.status(400).json({
                success: false,
                message: "You cannot deactivate your own account"
            });
        }
        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!existingUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        // Check email uniqueness if changing email
        if (email && email !== existingUser.email) {
            const emailExists = await prisma.user.findUnique({
                where: { email }
            });
            if (emailExists) {
                return res.status(400).json({
                    success: false,
                    message: "Email already in use by another user"
                });
            }
        }
        // Prepare update data
        const updateData = {};
        if (email !== undefined)
            updateData.email = email;
        if (role !== undefined)
            updateData.role = role;
        if (isActive !== undefined)
            updateData.isActive = isActive;
        if (isVerified !== undefined)
            updateData.isVerified = isVerified;
        // Update user
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            include: {
                profile: true
            }
        });
        // Update profile if provided
        if (profile) {
            await prisma.profile.upsert({
                where: { userId },
                update: {
                    firstName: profile.firstName || undefined,
                    lastName: profile.lastName || undefined,
                    phone: profile.phone || undefined,
                    address: profile.address || undefined
                },
                create: {
                    userId,
                    firstName: profile.firstName || '',
                    lastName: profile.lastName || '',
                    phone: profile.phone || '',
                    address: profile.address || ''
                }
            });
        }
        // Fetch updated user with profile
        const userWithProfile = await prisma.user.findUnique({
            where: { id: userId },
            include: { profile: true }
        });
        res.json({
            success: true,
            message: "User updated successfully",
            data: userWithProfile
        });
    }
    catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update user"
        });
    }
});
/**
 * DELETE /api/admin/users/:id - Delete user
 */
router.delete("/:id", adminOnlyRoute, async (req, res) => {
    try {
        const userId = req.params.id;
        const adminId = req.user.id;
        // Prevent admin from deleting themselves
        if (userId === adminId) {
            return res.status(400).json({
                success: false,
                message: "You cannot delete your own account"
            });
        }
        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        // Delete user (cascade will handle related records)
        await prisma.user.delete({
            where: { id: userId }
        });
        res.json({
            success: true,
            message: "User deleted successfully"
        });
    }
    catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete user"
        });
    }
});
/**
 * PATCH /api/admin/users/:id/toggle-status - Toggle user active status
 */
router.patch("/:id/toggle-status", adminOnlyRoute, async (req, res) => {
    try {
        const userId = req.params.id;
        const adminId = req.user.id;
        // Prevent admin from deactivating themselves
        if (userId === adminId) {
            return res.status(400).json({
                success: false,
                message: "You cannot change your own account status"
            });
        }
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                isActive: !user.isActive
            },
            select: {
                id: true,
                email: true,
                isActive: true,
                profile: {
                    select: {
                        firstName: true,
                        lastName: true
                    }
                }
            }
        });
        res.json({
            success: true,
            message: updatedUser.isActive ? "User activated" : "User deactivated",
            data: updatedUser
        });
    }
    catch (error) {
        console.error("Error toggling user status:", error);
        res.status(500).json({
            success: false,
            message: "Failed to toggle user status"
        });
    }
});
/**
 * PATCH /api/admin/users/:id/reset-password - Reset user password
 */
router.patch("/:id/reset-password", adminOnlyRoute, async (req, res) => {
    try {
        const userId = req.params.id;
        const { password } = req.body;
        if (!password || password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters long"
            });
        }
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 12);
        await prisma.user.update({
            where: { id: userId },
            data: {
                password: hashedPassword
            }
        });
        res.json({
            success: true,
            message: "Password reset successfully"
        });
    }
    catch (error) {
        console.error("Error resetting password:", error);
        res.status(500).json({
            success: false,
            message: "Failed to reset password"
        });
    }
});
export default router;
