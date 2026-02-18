import { Router, Request, Response } from "express";
import { adminOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";

const router = Router();

/**
 * GET /api/admin/analytics - Get comprehensive system analytics
 */
router.get("/", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const { 
      startDate, 
      endDate
    } = req.query;

    // Set default date range (last 30 days)
    const end = endDate ? new Date(endDate as string) : new Date();
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // User Analytics
    const [
      totalUsers,
      newUsersThisMonth,
      usersByRole,
      userGrowthData
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          }
        }
      }),
      prisma.user.groupBy({
        by: ['role'],
        _count: { role: true }
      }),
      prisma.user.groupBy({
        by: ['createdAt'],
        _count: { id: true },
        where: {
          createdAt: { gte: start, lte: end }
        },
        orderBy: { createdAt: 'asc' }
      })
    ]);

    // Product Analytics
    const [
      totalProducts,
      activeProducts,
      averageProductRating
    ] = await Promise.all([
      prisma.produce.count(),
      prisma.produce.count({
        where: { status: 'AVAILABLE' }
      }),
      prisma.review.aggregate({
        _avg: { rating: true }
      })
    ]);

    // Order Analytics
    const [
      totalOrders,
      totalRevenue,
      deliveredOrders,
      pendingOrders
    ] = await Promise.all([
      prisma.order.count({
        where: {
          createdAt: { gte: start, lte: end }
        }
      }),
      prisma.order.aggregate({
        where: {
          status: 'DELIVERED',
          createdAt: { gte: start, lte: end }
        },
        _sum: { totalAmount: true }
      }),
      prisma.order.count({
        where: { 
          status: 'DELIVERED',
          createdAt: { gte: start, lte: end }
        }
      }),
      prisma.order.count({
        where: { 
          status: 'PENDING',
          createdAt: { gte: start, lte: end }
        }
      })
    ]);

    // Expert Analytics
    const [
      totalExperts,
      totalConversations,
      totalArticles,
      expertEngagement
    ] = await Promise.all([
      prisma.user.count({
        where: { role: 'EXPERT' }
      }),
      prisma.conversation.count({
        where: {
          createdAt: { gte: start, lte: end }
        }
      }),
      prisma.article.count({
        where: {
          isPublished: true,
          publishedAt: { gte: start, lte: end }
        }
      }),
      prisma.article.groupBy({
        by: ['authorId'],
        _count: { authorId: true },
        _sum: { viewCount: true },
        orderBy: {
          _count: {
            authorId: 'desc'
          }
        },
        take: 5
      })
    ]);

    // System Health Metrics
    const unresolvedAlerts = await prisma.systemAlert.count({
      where: {
        isResolved: false
      }
    });

    const analytics = {
      users: {
        total: totalUsers,
        newThisMonth: newUsersThisMonth,
        activeUsers: totalUsers,
        byRole: usersByRole.reduce((acc: any, role: typeof usersByRole[0]) => {
          acc[role.role] = role._count.role;
          return acc;
        }, {}),
        growth: userGrowthData
      },
      products: {
        total: totalProducts,
        active: activeProducts,
        averageRating: averageProductRating._avg.rating || 0
      },
      orders: {
        total: totalOrders,
        completed: deliveredOrders,
        pending: pendingOrders,
        revenue: totalRevenue._sum.totalAmount || 0
      },
      experts: {
        total: totalExperts,
        totalConversations,
        totalArticles,
        topExperts: expertEngagement
      },
      system: {
        unresolvedAlerts
      }
    };

    res.json({
      success: true,
      data: analytics,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString()
      }
    });

  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch analytics data"
    });
  }
});

/**
 * GET /api/admin/analytics/dashboard - Get dashboard overview metrics
 */
router.get("/dashboard", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      dailyNewUsers,
      dailyOrders,
      dailyRevenue,
      systemHealth,
      recentActivity
    ] = await Promise.all([
      prisma.user.count({
        where: {
          createdAt: { gte: yesterday }
        }
      }),
      prisma.order.count({
        where: {
          createdAt: { gte: yesterday }
        }
      }),
      prisma.order.aggregate({
        where: {
          status: 'DELIVERED',
          createdAt: { gte: yesterday }
        },
        _sum: { totalAmount: true }
      }),
      prisma.systemAlert.count({
        where: { 
          isResolved: false,
          severity: { in: ['HIGH', 'CRITICAL'] }
        }
      }),
      prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true
        }
      })
    ]);

    // Calculate growth rates
    const [usersLastWeek, ordersLastWeek] = await Promise.all([
      prisma.user.count({
        where: {
          createdAt: { gte: lastWeek, lt: yesterday }
        }
      }),
      prisma.order.count({
        where: {
          createdAt: { gte: lastWeek, lt: yesterday }
        }
      })
    ]);

    const userGrowthRate = usersLastWeek > 0 ? ((dailyNewUsers - usersLastWeek) / usersLastWeek) * 100 : 0;
    const orderGrowthRate = ordersLastWeek > 0 ? ((dailyOrders - ordersLastWeek) / ordersLastWeek) * 100 : 0;

    res.json({
      success: true,
      data: {
        overview: {
          dailyNewUsers: {
            value: dailyNewUsers,
            growthRate: userGrowthRate
          },
          dailyOrders: {
            value: dailyOrders,
            growthRate: orderGrowthRate
          },
          dailyRevenue: {
            value: dailyRevenue._sum.totalAmount || 0
          },
          systemHealth: {
            criticalAlerts: systemHealth,
            status: systemHealth === 0 ? 'healthy' : 'attention-needed'
          }
        },
        recentActivity
      }
    });

  } catch (error) {
    console.error("Error fetching dashboard analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard analytics"
    });
  }
});

/**
 * GET /api/admin/analytics/revenue - Get detailed revenue analytics
 */
router.get("/revenue", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    
    const dateRange = {
      gte: new Date(`${year}-01-01`),
      lt: new Date(`${parseInt(year as string) + 1}-01-01`)
    };

    const revenueData = await prisma.order.groupBy({
      by: ['createdAt'],
      _sum: { totalAmount: true },
      _count: { id: true },
      where: {
        status: 'DELIVERED',
        createdAt: dateRange
      },
      orderBy: { createdAt: 'asc' }
    });

    // Get top selling products
    const topProducts = await prisma.orderItem.groupBy({
      by: ['produceId'],
      _sum: { quantity: true, price: true },
      _count: { produceId: true },
      orderBy: {
        _sum: {
          price: 'desc'
        }
      },
      take: 10
    });

    const productsWithDetails = await Promise.all(
      topProducts.map(async (item: typeof topProducts[0]) => {
        const produce = await prisma.produce.findUnique({
          where: { id: item.produceId },
          select: {
            name: true,
            farmer: {
              select: {
                name: true,
                location: true
              }
            }
          }
        });
        return {
          ...item,
          produce
        };
      })
    );

    res.json({
      success: true,
      data: {
        revenueTimeline: revenueData,
        topProducts: productsWithDetails,
        year
      }
    });

  } catch (error) {
    console.error("Error fetching revenue analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch revenue analytics"
    });
  }
});

export default router;