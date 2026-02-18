import { Router, Request, Response } from "express";
import { buyerOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";

const router = Router();

/**
 * GET /api/buyer/browse - Browse available products with filters
 */
router.get("/", buyerOnlyRoute, async (req: Request, res: Response) => {
  try {
    const {
      search,
      category,
      location,
      minPrice,
      maxPrice,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 12
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const where: any = { status: "AVAILABLE" };

    // Apply filters
    if (search) {
      where.name = {
        contains: search as string,
        mode: 'insensitive'
      };
    }

    if (category) {
      where.category = {
        name: {
          equals: category as string,
          mode: 'insensitive'
        }
      };
    }

    if (location) {
      where.farmer = {
        location: {
          contains: location as string,
          mode: 'insensitive'
        }
      };
    }

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseFloat(minPrice as string);
      if (maxPrice) where.price.lte = parseFloat(maxPrice as string);
    }

    // Determine sort criteria
    let orderBy: any = {};
    switch (sortBy) {
      case 'price':
        orderBy = { price: sortOrder };
        break;
      case 'name':
        orderBy = { name: sortOrder };
        break;
      case 'rating':
        // This would need a calculated field in a real system
        orderBy = { createdAt: 'desc' };
        break;
      default:
        orderBy = { createdAt: sortOrder };
    }

    const [products, totalCount, categories, locations] = await Promise.all([
      // Get products with pagination
      prisma.produce.findMany({
        where,
        orderBy,
        skip,
        take: parseInt(limit as string),
        include: {
          farmer: {
            select: {
              id: true,
              name: true,
              location: true,
              image: true
            }
          },
          category: {
            select: {
              name: true
            }
          },
          orderItems: {
            select: {
              quantity: true
            }
          }
        }
      }),

      // Get total count for pagination
      prisma.produce.count({ where }),

      // Get available categories for filter
      prisma.category.findMany({
        select: {
          name: true,
          _count: {
            select: {
              produce: {
                where: { status: "AVAILABLE" }
              }
            }
          }
        }
      }),

      // Get available locations for filter
      prisma.user.findMany({
        where: {
          role: "FARMER",
          location: {
            not: null
          },
          produce: {
            some: {
              status: "AVAILABLE"
            }
          }
        },
        select: {
          location: true
        },
        distinct: ['location']
      })
    ]);

    // Add computed fields to products
    const productsWithStats = await Promise.all(products.map(async (product: typeof products[0]) => {
      // Get reviews for this product
      const reviews = await prisma.review.findMany({
        where: { targetId: product.id, reviewType: 'product' },
        select: { rating: true }
      });
      return {
        ...product,
        averageRating: reviews.length > 0 
          ? reviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / reviews.length 
          : 0,
        reviewCount: reviews.length,
        totalSold: product.orderItems.reduce((sum: number, item: typeof product.orderItems[0]) => sum + item.quantity, 0),
        remainingQuantity: product.quantity - product.orderItems.reduce((sum: number, item: typeof product.orderItems[0]) => sum + item.quantity, 0)
      };
    }));

    res.json({
      success: true,
      data: {
        products: productsWithStats,
        pagination: {
          current: parseInt(page as string),
          total: Math.ceil(totalCount / parseInt(limit as string)),
          hasNext: skip + parseInt(limit as string) < totalCount,
          hasPrev: parseInt(page as string) > 1,
          totalCount
        },
        filters: {
          categories: categories.filter((cat: typeof categories[0]) => cat._count.produce > 0),
          locations: locations.map((l: typeof locations[0]) => l.location).filter(Boolean)
        }
      }
    });

  } catch (error) {
    console.error("Error browsing products:", error);
    res.status(500).json({
      success: false,
      message: "Failed to browse products"
    });
  }
});

/**
 * GET /api/buyer/browse/:id - Get detailed product information
 */
router.get("/:id", buyerOnlyRoute, async (req: Request, res: Response) => {
  try {
    const productId = req.params.id;

    const product = await prisma.produce.findUnique({
      where: { id: productId },
      include: {
        farmer: {
          select: {
            id: true,
            name: true,
            location: true,
            image: true,
            phone: true,
            farmerProfile: {
              select: {
                rating: true,
                reviewCount: true,
                totalSales: true
              }
            }
          }
        },
        category: {
          select: {
            name: true
          }
        },
        orderItems: {
          select: {
            quantity: true,
            createdAt: true
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

    if (product.status !== "AVAILABLE") {
      return res.status(400).json({
        success: false,
        message: "Product is not available for purchase"
      });
    }

    // Get reviews for this product
    const productReviews = await prisma.review.findMany({
      where: { targetId: productId, reviewType: 'product' },
      include: {
        reviewer: {
          select: {
            name: true,
            image: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // Calculate additional stats
    const averageRating = productReviews.length > 0 
      ? productReviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / productReviews.length 
      : 0;

    const totalSold = product.orderItems.reduce((sum: number, item: typeof product.orderItems[0]) => sum + item.quantity, 0);
    const remainingQuantity = product.quantity - totalSold;

    // Get similar products
    const similarProducts = await prisma.produce.findMany({
      where: {
        categoryId: product.categoryId,
        status: "AVAILABLE",
        NOT: {
          id: productId
        }
      },
      take: 4,
      include: {
        farmer: {
          select: {
            name: true,
            location: true
          }
        }
      }
    });

    // Get reviews for similar products
    const similarProductsWithStats = await Promise.all(similarProducts.map(async (p: typeof similarProducts[0]) => {
      const reviews = await prisma.review.findMany({
        where: { targetId: p.id, reviewType: 'product' },
        select: { rating: true }
      });
      return {
        ...p,
        averageRating: reviews.length > 0 
          ? reviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / reviews.length 
          : 0,
        reviewCount: reviews.length
      };
    }));

    res.json({
      success: true,
      data: {
        product: {
          ...product,
          reviews: productReviews,
          averageRating,
          reviewCount: productReviews.length,
          totalSold,
          remainingQuantity
        },
        similarProducts: similarProductsWithStats
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
 * POST /api/buyer/browse/:id/favorite - Add/remove product from favorites
 */
router.post("/:id/favorite", buyerOnlyRoute, async (req: Request, res: Response) => {
  try {
    const buyerId = req.user!.id;
    const productId = req.params.id;

    // Check if product exists and is available
    const product = await prisma.produce.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    // Check if already in favorites
    const existingFavorite = await prisma.favorite.findUnique({
      where: {
        buyerId_produceId: {
          buyerId,
          produceId: productId
        }
      }
    });

    if (existingFavorite) {
      // Remove from favorites
      await prisma.favorite.delete({
        where: {
          id: existingFavorite.id
        }
      });

      res.json({
        success: true,
        message: "Removed from favorites",
        isFavorite: false
      });
    } else {
      // Add to favorites
      await prisma.favorite.create({
        data: {
          buyerId,
          produceId: productId
        }
      });

      res.json({
        success: true,
        message: "Added to favorites",
        isFavorite: true
      });
    }

    // Update buyer profile favorite count
    const favoriteCount = await prisma.favorite.count({
      where: { buyerId }
    });

    await prisma.buyerProfile.upsert({
      where: { userId: buyerId },
      update: { favoriteCount },
      create: {
        userId: buyerId,
        favoriteCount,
        totalOrders: 0,
        totalSpent: 0
      }
    });

  } catch (error) {
    console.error("Error updating favorites:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update favorites"
    });
  }
});

export default router;