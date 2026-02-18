import { Router, Request, Response } from "express";
import { adminOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";

const router = Router();

/**
 * GET /api/admin/users - Get all users with filtering and pagination
 */
router.get("/", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const {
      role = 'all',
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const where: any = {};

    // Apply filters
    if (role !== 'all') {
      where.role = role;
    }

    if (search) {
      where.OR = [
        { email: { contains: search as string, mode: 'insensitive' } },
        { name: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    const orderBy: any = {};
    orderBy[sortBy as string] = sortOrder;

    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy,
        skip,
        take: parseInt(limit as string),
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          location: true,
          emailVerified: true,
          image: true,
          createdAt: true,
          _count: {
            select: {
              produce: true,
              orders: true
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
          current: parseInt(page as string),
          total: Math.ceil(totalCount / parseInt(limit as string)),
          hasNext: skip + parseInt(limit as string) < totalCount,
          totalCount
        },
        statistics: {
          total: totalCount,
          byRole: roleStats.reduce((acc: any, stat: any) => {
            acc[stat.role] = stat._count.role;
            return acc;
          }, {})
        }
      }
    });

  } catch (error) {
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
router.get("/:id", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        location: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        produce: {
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
        orders: {
          select: {
            id: true,
            totalAmount: true,
            status: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 5
        },
        _count: {
          select: {
            produce: true,
            orders: true,
            reviewsGiven: true
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
        _avg: { price: true },
        _count: { id: true }
      });
      
      additionalStats = {
        totalListings: farmerStats._count.id || 0,
        averagePrice: farmerStats._avg.price || 0
      };
    }

    if (user.role === 'BUYER') {
      const buyerStats = await prisma.order.aggregate({
        where: { buyerId: userId, status: 'DELIVERED' },
        _sum: { totalAmount: true },
        _count: { id: true }
      });
      
      additionalStats = {
        totalSpent: buyerStats._sum.totalAmount || 0,
        completedOrders: buyerStats._count.id || 0
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

  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user details"
    });
  }
});

/**
 * POST /api/admin/users - Create new user (via Better Auth account)
 */
router.post("/", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const {
      email,
      name,
      role,
      phone,
      location
    } = req.body;

    // Validate required fields
    if (!email || !role) {
      return res.status(400).json({
        success: false,
        message: "Email and role are required"
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

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        name: name || '',
        role,
        phone: phone || null,
        location: location || null,
        emailVerified: true
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        location: true,
        createdAt: true
      }
    });

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: user
    });

  } catch (error) {
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
router.put("/:id", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const adminId = req.user!.id;
    const {
      email,
      name,
      role,
      phone,
      location
    } = req.body;

    // Prevent admin from changing their own role
    if (userId === adminId && role && role !== 'ADMIN') {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own role"
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
    const updateData: any = {};
    if (email !== undefined) updateData.email = email;
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) updateData.role = role;
    if (phone !== undefined) updateData.phone = phone;
    if (location !== undefined) updateData.location = location;

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        location: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({
      success: true,
      message: "User updated successfully",
      data: updatedUser
    });

  } catch (error) {
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
router.delete("/:id", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const adminId = req.user!.id;

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

  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete user"
    });
  }
});

/**
 * PATCH /api/admin/users/:id/toggle-status - Toggle user verified status
 */
router.patch("/:id/toggle-status", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const adminId = req.user!.id;

    // Prevent admin from toggling themselves
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
        emailVerified: !user.emailVerified
      },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true
      }
    });

    res.json({
      success: true,
      message: updatedUser.emailVerified ? "User verified" : "User unverified",
      data: updatedUser
    });

  } catch (error) {
    console.error("Error toggling user status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle user status"
    });
  }
});

/**
 * PATCH /api/admin/users/:id/change-role - Change user role
 */
router.patch("/:id/change-role", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const adminId = req.user!.id;
    const { role } = req.body;

    if (userId === adminId) {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own role"
      });
    }

    if (!role || !['FARMER', 'BUYER', 'EXPERT', 'ADMIN'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Valid role is required (FARMER, BUYER, EXPERT, ADMIN)"
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
      data: { role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });

    res.json({
      success: true,
      message: "User role updated successfully",
      data: updatedUser
    });

  } catch (error) {
    console.error("Error changing user role:", error);
    res.status(500).json({
      success: false,
      message: "Failed to change user role"
    });
  }
});

export default router;