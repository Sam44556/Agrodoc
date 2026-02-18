import { Router } from "express";
import { buyerOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";
const router = Router();
/**
 * GET /api/buyer/profile - Get buyer's profile data
 */
router.get("/", buyerOnlyRoute, async (req, res) => {
    try {
        const buyerId = req.user.id;
        // Get user and buyer profile data
        const [user, buyerProfile] = await Promise.all([
            prisma.user.findUnique({
                where: { id: buyerId },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    location: true,
                    image: true,
                    createdAt: true
                }
            }),
            prisma.buyerProfile.findUnique({
                where: { userId: buyerId }
            })
        ]);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        // Create buyer profile if it doesn't exist
        let profile = buyerProfile;
        if (!profile) {
            profile = await prisma.buyerProfile.create({
                data: {
                    userId: buyerId,
                    totalOrders: 0,
                    totalSpent: 0,
                    favoriteCount: 0
                }
            });
        }
        res.json({
            success: true,
            data: {
                user,
                profile
            }
        });
    }
    catch (error) {
        console.error("Error fetching buyer profile:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch profile data"
        });
    }
});
/**
 * PUT /api/buyer/profile - Update buyer's profile
 */
router.put("/", buyerOnlyRoute, async (req, res) => {
    try {
        const buyerId = req.user.id;
        const { name, phone, location, deliveryAddress, paymentMethod } = req.body;
        // Update user basic info
        const updateUserData = {};
        if (name !== undefined)
            updateUserData.name = name;
        if (phone !== undefined)
            updateUserData.phone = phone;
        if (location !== undefined)
            updateUserData.location = location;
        // Update buyer profile specific info
        const updateProfileData = {};
        if (deliveryAddress !== undefined)
            updateProfileData.deliveryAddress = deliveryAddress;
        if (paymentMethod !== undefined)
            updateProfileData.paymentMethod = paymentMethod;
        const [updatedUser, updatedProfile] = await Promise.all([
            // Update user table
            Object.keys(updateUserData).length > 0
                ? prisma.user.update({
                    where: { id: buyerId },
                    data: {
                        ...updateUserData,
                        updatedAt: new Date()
                    },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        location: true,
                        image: true,
                        createdAt: true
                    }
                })
                : prisma.user.findUnique({
                    where: { id: buyerId },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        location: true,
                        image: true,
                        createdAt: true
                    }
                }),
            // Update or create buyer profile
            Object.keys(updateProfileData).length > 0
                ? prisma.buyerProfile.upsert({
                    where: { userId: buyerId },
                    update: {
                        ...updateProfileData,
                        updatedAt: new Date()
                    },
                    create: {
                        userId: buyerId,
                        ...updateProfileData,
                        totalOrders: 0,
                        totalSpent: 0,
                        favoriteCount: 0
                    }
                })
                : prisma.buyerProfile.upsert({
                    where: { userId: buyerId },
                    update: {},
                    create: {
                        userId: buyerId,
                        totalOrders: 0,
                        totalSpent: 0,
                        favoriteCount: 0
                    }
                })
        ]);
        res.json({
            success: true,
            message: "Profile updated successfully",
            data: {
                user: updatedUser,
                profile: updatedProfile
            }
        });
    }
    catch (error) {
        console.error("Error updating buyer profile:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update profile"
        });
    }
});
export default router;
