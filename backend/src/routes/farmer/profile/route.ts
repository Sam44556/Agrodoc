import { Router, Request, Response } from "express";
import { farmerOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";

const router = Router();

/**
 * GET /api/farmer/profile - Get farmer's profile data
 */
router.get("/", farmerOnlyRoute, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        farmerProfile: true
      }
    });

    if (!user) {
      return res.status(404).json({ 
        error: "User not found",
        message: "Farmer profile does not exist"
      });
    }

    // Return profile data from User table + stats from FarmerProfile
    const farmerProfile = {
      // Base profile data from User table
      name: user.name,
      email: user.email,
      phone: user.phone,
      location: user.location,
      profilePicture: user.image,
      
      // Stats from FarmerProfile table
      totalRevenue: user.farmerProfile?.totalRevenue || 0,
      activeListings: user.farmerProfile?.activeListings || 0,
      totalSales: user.farmerProfile?.totalSales || 0,
      rating: user.farmerProfile?.rating || 0,
      reviewCount: user.farmerProfile?.reviewCount || 0
    };

    res.json({
      success: true,
      data: farmerProfile
    });

  } catch (error) {
    console.error("❌ Error fetching farmer profile:", error);
    res.status(500).json({
      error: "Failed to fetch profile",
      message: "Could not retrieve farmer profile data"
    });
  }
});

/**
 * PUT /api/farmer/profile - Update farmer's profile
 */
router.put("/", farmerOnlyRoute, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, phone, location } = req.body;

    // Update base user information (only fields that exist in User table)
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(phone && { phone }),
        ...(location && { location })
      }
    });

    // Get farmer profile stats
    const farmerProfile = await prisma.farmerProfile.findUnique({
      where: { userId: userId }
    });

    // Return updated profile
    const completeProfile = {
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      location: updatedUser.location,
      profilePicture: updatedUser.image,
      totalRevenue: farmerProfile?.totalRevenue || 0,
      activeListings: farmerProfile?.activeListings || 0,
      totalSales: farmerProfile?.totalSales || 0,
      rating: farmerProfile?.rating || 0,
      reviewCount: farmerProfile?.reviewCount || 0
    };

    res.json({
      success: true,
      data: completeProfile,
      message: "Profile updated successfully"
    });

  } catch (error) {
    console.error("❌ Error updating farmer profile:", error);
    res.status(500).json({
      error: "Failed to update profile",
      message: "Could not save profile changes"
    });
  }
});

export default router;