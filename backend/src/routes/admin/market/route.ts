import { Router, Request, Response } from "express";
import { adminOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";

const router = Router();

/**
 * GET /api/admin/market - Get market overview and product management
 */
router.get("/", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const {
      status = 'all',
      category,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const where: any = {};

    // Apply filters
    if (status !== 'all') {
      where.status = status;
    }

    if (category) {
      where.categoryId = category;
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    const orderBy: any = {};
    orderBy[sortBy as string] = sortOrder;

    const [products, totalCount, categories] = await Promise.all([
      prisma.produce.findMany({
        where,
        orderBy,
        skip,
        take: parseInt(limit as string),
        include: {
          farmer: {
            select: {
              id: true,
              email: true,
              name: true,
              location: true
            }
          },
          category: {
            select: {
              id: true,
              name: true
            }
          },
          _count: {
            select: {
              orderItems: true
            }
          }
        }
      }),
      prisma.produce.count({ where }),
      prisma.category.findMany({
        select: {
          id: true,
          name: true,
          _count: {
            select: { produce: true }
          }
        }
      })
    ]);

    // Calculate market statistics
    const [
      totalProducts,
      activeProducts,
      soldOutProducts,
      totalRevenue
    ] = await Promise.all([
      prisma.produce.count(),
      prisma.produce.count({ where: { status: 'AVAILABLE' } }),
      prisma.produce.count({ where: { status: 'SOLD_OUT' } }),
      prisma.orderItem.aggregate({
        _sum: { price: true },
        where: {
          order: { status: 'DELIVERED' }
        }
      })
    ]);

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          current: parseInt(page as string),
          total: Math.ceil(totalCount / parseInt(limit as string)),
          hasNext: skip + parseInt(limit as string) < totalCount,
          totalCount
        },
        categories,
        statistics: {
          totalProducts,
          activeProducts,
          soldOut: soldOutProducts,
          totalRevenue: totalRevenue._sum.price || 0
        }
      }
    });

  } catch (error) {
    console.error("Error fetching market data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch market data"
    });
  }
});

/**
 * GET /api/admin/market/:id - Get specific product details
 */
router.get("/:id", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const productId = req.params.id;

    const product = await prisma.produce.findUnique({
      where: { id: productId },
      include: {
        farmer: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            location: true
          }
        },
        category: true,
        orderItems: {
          include: {
            order: {
              select: {
                id: true,
                status: true,
                createdAt: true,
                buyer: {
                  select: {
                    name: true,
                    email: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    // Calculate product statistics
    const totalQuantitySold = product.orderItems.reduce((sum: number, item: any) => sum + item.quantity, 0);
    const totalRevenue = product.orderItems.reduce((sum: number, item: any) => sum + item.price, 0);

    // Get reviews for this product
    const reviews = await prisma.review.findMany({
      where: { targetId: productId, reviewType: 'product' },
      include: {
        reviewer: {
          select: { name: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const averageRating = reviews.length > 0 
      ? reviews.reduce((sum: number, review: any) => sum + review.rating, 0) / reviews.length 
      : 0;

    res.json({
      success: true,
      data: {
        ...product,
        reviews,
        statistics: {
          totalQuantitySold,
          totalRevenue,
          averageRating,
          totalReviews: reviews.length,
          totalOrders: product.orderItems.length
        }
      }
    });

  } catch (error) {
    console.error("Error fetching product details:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch product details"
    });
  }
});

/**
 * PATCH /api/admin/market/:id/approve - Set product to AVAILABLE
 */
router.patch("/:id/approve", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const productId = req.params.id;

    const product = await prisma.produce.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const updatedProduct = await prisma.produce.update({
      where: { id: productId },
      data: {
        status: 'AVAILABLE'
      },
      include: {
        farmer: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    res.json({
      success: true,
      message: "Product set to available",
      data: updatedProduct
    });

  } catch (error) {
    console.error("Error approving product:", error);
    res.status(500).json({
      success: false,
      message: "Failed to approve product"
    });
  }
});

/**
 * PATCH /api/admin/market/:id/flag - Deactivate product (set to INACTIVE)
 */
router.patch("/:id/flag", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const productId = req.params.id;

    const product = await prisma.produce.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const updatedProduct = await prisma.produce.update({
      where: { id: productId },
      data: {
        status: 'INACTIVE'
      },
      include: {
        farmer: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    res.json({
      success: true,
      message: "Product deactivated",
      data: updatedProduct
    });

  } catch (error) {
    console.error("Error flagging product:", error);
    res.status(500).json({
      success: false,
      message: "Failed to flag product"
    });
  }
});

/**
 * PATCH /api/admin/market/:id/unflag - Reactivate product (set to AVAILABLE)
 */
router.patch("/:id/unflag", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const productId = req.params.id;

    const product = await prisma.produce.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    if (product.status !== 'INACTIVE') {
      return res.status(400).json({
        success: false,
        message: "Product is not inactive"
      });
    }

    const updatedProduct = await prisma.produce.update({
      where: { id: productId },
      data: {
        status: 'AVAILABLE'
      },
      include: {
        farmer: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    res.json({
      success: true,
      message: "Product reactivated",
      data: updatedProduct
    });

  } catch (error) {
    console.error("Error unflagging product:", error);
    res.status(500).json({
      success: false,
      message: "Failed to unflag product"
    });
  }
});

/**
 * DELETE /api/admin/market/:id - Delete product
 */
router.delete("/:id", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const productId = req.params.id;

    const product = await prisma.produce.findUnique({
      where: { id: productId },
      include: {
        _count: {
          select: {
            orderItems: true
          }
        }
      }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    // Check if product has orders
    if (product._count.orderItems > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete product with existing orders"
      });
    }

    await prisma.produce.delete({
      where: { id: productId }
    });

    res.json({
      success: true,
      message: "Product deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete product"
    });
  }
});

/**
 * GET /api/admin/market/categories - Get all categories with statistics
 */
router.get("/categories", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: {
            produce: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json({
      success: true,
      data: categories
    });

  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch categories"
    });
  }
});

/**
 * POST /api/admin/market/categories - Create new category
 */
router.post("/categories", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Category name is required"
      });
    }

    // Check if category already exists
    const existingCategory = await prisma.category.findUnique({
      where: { name }
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category with this name already exists"
      });
    }

    const category = await prisma.category.create({
      data: {
        name
      }
    });

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: category
    });

  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create category"
    });
  }
});

export default router;