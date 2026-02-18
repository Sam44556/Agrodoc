import { Router } from "express";
import { expertOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";
const router = Router();
/**
 * GET /api/expert/profile - Get expert's profile data
 */
router.get("/", expertOnlyRoute, async (req, res) => {
    try {
        const expertId = req.user.id;
        const [user, expertProfile] = await Promise.all([
            prisma.user.findUnique({
                where: { id: expertId },
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
            prisma.expertProfile.findUnique({
                where: { userId: expertId }
            })
        ]);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        // Create expert profile if it doesn't exist
        let profile = expertProfile;
        if (!profile) {
            profile = await prisma.expertProfile.create({
                data: {
                    userId: expertId,
                    conversationCount: 0,
                    totalEarnings: 0,
                    rating: 0,
                    reviewCount: 0,
                    hourlyRate: 0
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
        console.error("Error fetching expert profile:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch profile data"
        });
    }
});
/**
 * PUT /api/expert/profile - Update expert's profile
 */
router.put("/", expertOnlyRoute, async (req, res) => {
    try {
        const expertId = req.user.id;
        const { name, phone, location, hourlyRate } = req.body;
        const updateUserData = {};
        if (name !== undefined)
            updateUserData.name = name;
        if (phone !== undefined)
            updateUserData.phone = phone;
        if (location !== undefined)
            updateUserData.location = location;
        const updateProfileData = {};
        if (hourlyRate !== undefined) {
            if (hourlyRate < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Hourly rate cannot be negative"
                });
            }
            updateProfileData.hourlyRate = parseFloat(hourlyRate);
        }
        const [updatedUser, updatedProfile] = await Promise.all([
            Object.keys(updateUserData).length > 0
                ? prisma.user.update({
                    where: { id: expertId },
                    data: { ...updateUserData, updatedAt: new Date() },
                    select: {
                        id: true, name: true, email: true, phone: true,
                        location: true, image: true, createdAt: true
                    }
                })
                : prisma.user.findUnique({
                    where: { id: expertId },
                    select: {
                        id: true, name: true, email: true, phone: true,
                        location: true, image: true, createdAt: true
                    }
                }),
            Object.keys(updateProfileData).length > 0
                ? prisma.expertProfile.upsert({
                    where: { userId: expertId },
                    update: { ...updateProfileData, updatedAt: new Date() },
                    create: {
                        userId: expertId, ...updateProfileData,
                        conversationCount: 0, totalEarnings: 0,
                        rating: 0, reviewCount: 0
                    }
                })
                : prisma.expertProfile.upsert({
                    where: { userId: expertId },
                    update: {},
                    create: {
                        userId: expertId, conversationCount: 0,
                        totalEarnings: 0, rating: 0, reviewCount: 0, hourlyRate: 0
                    }
                })
        ]);
        res.json({
            success: true,
            message: "Profile updated successfully",
            data: { user: updatedUser, profile: updatedProfile }
        });
    }
    catch (error) {
        console.error("Error updating expert profile:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update profile"
        });
    }
});
export default router;
