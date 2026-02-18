import { Router, Request, Response } from "express";
import { buyerOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";

const router = Router();

/**
 * GET /api/buyer/dashboard - Get buyer's dashboard overview data
 */
router.get("/", buyerOnlyRoute, async (req: Request, res: Response) => {
  try {
    const buyerId = req.user!.id;

    // Get buyer's order statistics
    const [
      totalOrders,
      pendingOrders,
      deliveredOrders,
      totalSpent,
      recentOrders,
      favoriteCount,
      recentlyViewedCount
    ] = await Promise.all([
      // Total orders
      prisma.order.count({
        where: { buyerId }
      }),
      
      // Pending orders
      prisma.order.count({
        where: { 
          buyerId,
          status: "PENDING"
        }
      }),
      
      // Delivered orders
      prisma.order.count({
        where: { 
          buyerId,
          status: "DELIVERED"
        }
      }),
      
      // Total amount spent
      prisma.order.aggregate({
        where: { buyerId },
        _sum: {
          totalAmount: true
        }
      }),
      
      // Recent orders (last 10)
      prisma.order.findMany({
        where: { buyerId },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          items: {
            include: {
              produce: {
                select: {
                  name: true,
                  images: true,
                  farmer: {
                    select: {
                      name: true,
                      location: true
                    }
                  }
                }
              }
            }
          }
        }
      }),
      
      // Favorite products count
      prisma.favorite.count({
        where: { buyerId }
      }),
      
      // Mock recently viewed count (you can implement actual tracking)
      Promise.resolve(Math.floor(Math.random() * 15) + 5)
    ]);

    // Get top categories by purchase frequency
    // First get all buyer's orders
    const buyerOrders = await prisma.order.findMany({
      where: { buyerId },
      select: { id: true }
    });
    
    const orderIds = buyerOrders.map((o: { id: string }) => o.id);
    
    const topCategories = orderIds.length > 0 
      ? await prisma.orderItem.groupBy({
          by: ['produceId'],
          where: {
            orderId: { in: orderIds }
          },
          _count: {
            _all: true
          },
          orderBy: {
            _count: {
              _all: 'desc'
            }
          },
          take: 5
        })
      : [];

    // Get the actual category names
    const categoryDetails = await Promise.all(
      topCategories.map(async (item: typeof topCategories[0]) => {
        const produce = await prisma.produce.findUnique({
          where: { id: item.produceId },
          include: {
            category: {
              select: { name: true }
            }
          }
        });
        return {
          categoryName: produce?.category.name || 'Unknown',
          purchaseCount: item._count._all
        };
      })
    );

    // Get recommended products (mock algorithm - you can implement ML later)
    const recommendedProducts = await prisma.produce.findMany({
      where: {
        status: "AVAILABLE",
        NOT: {
          farmer: {
            id: buyerId // Don't recommend buyer's own products if they're also a farmer
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 6,
      include: {
        farmer: {
          select: {
            name: true,
            location: true
          }
        },
        category: {
          select: {
            name: true
          }
        }
      }
    });

    // Add computed fields to recommended products (reviews via separate query since Review uses targetId)
    const productsWithStats = await Promise.all(
      recommendedProducts.map(async (product: typeof recommendedProducts[0]) => {
        const reviews = await prisma.review.findMany({
          where: { targetId: product.id, reviewType: 'product' },
          select: { rating: true }
        });
        return {
          ...product,
          averageRating: reviews.length > 0 
            ? reviews.reduce((sum: number, r: { rating: number }) => sum + r.rating, 0) / reviews.length 
            : 0,
          reviewCount: reviews.length
        };
      })
    );

    // Calculate savings (mock data - implement actual discount tracking)
    const totalSavings = Math.floor((totalSpent._sum.totalAmount || 0) * 0.12); // 12% average savings

    // Get recent activity (orders in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const monthlyActivity = await prisma.order.findMany({
      where: {
        buyerId,
        createdAt: {
          gte: thirtyDaysAgo
        }
      },
      include: {
        items: {
          include: {
            produce: {
              select: {
                name: true
              }
            }
          }
        }
      }
    });

    res.json({
      success: true,
      data: {
        // Overview stats
        overview: {
          totalOrders,
          pendingOrders,
          deliveredOrders,
          totalSpent: totalSpent._sum.totalAmount || 0,
          totalSavings,
          favoriteCount,
          recentlyViewedCount
        },
        
        // Recent orders
        recentOrders: recentOrders.map((order: typeof recentOrders[0]) => ({
          id: order.id,
          status: order.status,
          totalAmount: order.totalAmount,
          itemCount: order.items.length,
          createdAt: order.createdAt,
          items: order.items.map((item: typeof order.items[0]) => ({
            productName: item.produce.name,
            quantity: item.quantity,
            price: item.price,
            farmerName: item.produce.farmer.name,
            farmerLocation: item.produce.farmer.location,
            images: item.produce.images
          }))
        })),
        
        // Recommended products
        recommendedProducts: productsWithStats,
        
        // Top categories
        topCategories: categoryDetails,
        
        // Monthly activity summary
        monthlyActivity: {
          totalOrders: monthlyActivity.length,
          totalSpent: monthlyActivity.reduce((sum: number, order: typeof monthlyActivity[0]) => sum + order.totalAmount, 0),
          uniqueProducts: new Set(
            monthlyActivity.flatMap((order: typeof monthlyActivity[0]) => 
              order.items.map((item: typeof order.items[0]) => item.produce.name)
            )
          ).size
        }
      }
    });

  } catch (error) {
    console.error("Error fetching buyer dashboard:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load dashboard data"
    });
  }
});

export default router;