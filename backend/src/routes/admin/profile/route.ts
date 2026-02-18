import { Router, Request, Response } from "express";
import { adminOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";

const router = Router();

/**
 * GET /api/admin/profile - Get admin profile
 */
router.get("/", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const adminId = req.user!.id;

    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        location: true,
        image: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        adminProfile: true
      }
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin profile not found"
      });
    }

    // Get admin activity statistics
    const [
      totalUsers,
      totalOrders,
      totalProducts
    ] = await Promise.all([
      prisma.user.count(),
      prisma.order.count(),
      prisma.produce.count()
    ]);

    res.json({
      success: true,
      data: {
        ...admin,
        statistics: {
          totalUsers,
          totalOrders,
          totalProducts
        }
      }
    });

  } catch (error) {
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
router.put("/", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const adminId = req.user!.id;
    const {
      email,
      name,
      phone,
      location
    } = req.body;

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

    // Prepare update data
    const updateData: any = {};
    if (email !== undefined) updateData.email = email;
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (location !== undefined) updateData.location = location;

    const updatedUser = await prisma.user.update({
      where: { id: adminId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        location: true,
        image: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        adminProfile: true
      }
    });

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser
    });

  } catch (error) {
    console.error("Error updating admin profile:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update admin profile"
    });
  }
});

export default router;