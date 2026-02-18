import { Router } from "express";
import { adminOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";
const router = Router();
/**
 * GET /api/admin/analytics - Get comprehensive system analytics
 */
router.get("/", adminOnlyRoute, async (req, res) => {
    try {
        const { startDate, endDate, metrics = 'all' } = req.query;
        // Set default date range (last 30 days)
        const end = endDate ? new Date(endDate) : new Date();
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        // User Analytics
        const [totalUsers, newUsersThisMonth, activeUsers, usersByRole, userGrowthData] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({
                where: {
                    createdAt: {
                        gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                    }
                }
            }),
            prisma.user.count({
                where: {
                    lastActiveAt: {
                        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
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
        const [totalProducts, activeProducts, productsByCategory, averageProductRating, topProducts] = await Promise.all([
            prisma.produce.count(),
            prisma.produce.count({
                where: { status: 'AVAILABLE' }
            }),
            prisma.produce.groupBy({
                by: ['categoryId'],
                _count: { categoryId: true },
                include: {
                    category: {
                        select: { name: true }
                    }
                }
            }),
            prisma.review.aggregate({
                _avg: { rating: true }
            }),
            prisma.produce.findMany({
                take: 5,
                orderBy: {
                    reviews: {
                        _count: 'desc'
                    }
                },
                select: {
                    id: true,
                    name: true,
                    price: true,
                    _count: {
                        select: {
                            reviews: true,
                            OrderItem: true
                        }
                    },
                    reviews: {
                        select: { rating: true }
                    }
                }
            })
        ]);
        // Order Analytics
        const [totalOrders, totalRevenue, completedOrders, pendingOrders, ordersByMonth, revenueByMonth] = await Promise.all([
            prisma.order.count({
                where: {
                    createdAt: { gte: start, lte: end }
                }
            }),
            prisma.order.aggregate({
                where: {
                    status: 'COMPLETED',
                    createdAt: { gte: start, lte: end }
                },
                _sum: { total: true }
            }),
            prisma.order.count({
                where: {
                    status: 'COMPLETED',
                    createdAt: { gte: start, lte: end }
                }
            }),
            prisma.order.count({
                where: {
                    status: 'PENDING',
                    createdAt: { gte: start, lte: end }
                }
            }),
            prisma.order.groupBy({
                by: ['createdAt'],
                _count: { id: true },
                where: {
                    createdAt: { gte: start, lte: end }
                },
                orderBy: { createdAt: 'asc' }
            }),
            prisma.order.groupBy({
                by: ['createdAt'],
                _sum: { total: true },
                where: {
                    status: 'COMPLETED',
                    createdAt: { gte: start, lte: end }
                },
                orderBy: { createdAt: 'asc' }
            })
        ]);
        // Expert Analytics
        const [totalExperts, activeExperts, totalConversations, totalArticles, expertEngagement] = await Promise.all([
            prisma.user.count({
                where: { role: 'EXPERT' }
            }),
            prisma.user.count({
                where: {
                    role: 'EXPERT',
                    lastActiveAt: {
                        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                    }
                }
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
        const [errorLogs, systemAlerts, databaseSize] = await Promise.all([
            prisma.systemLog.count({
                where: {
                    level: 'ERROR',
                    createdAt: { gte: start, lte: end }
                }
            }),
            prisma.alert.count({
                where: {
                    isResolved: false,
                    createdAt: { gte: start, lte: end }
                }
            }),
            prisma.$queryRaw `
        SELECT 
          table_name,
          pg_size_pretty(pg_total_relation_size(table_name::regclass)) as size,
          pg_total_relation_size(table_name::regclass) as bytes
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY pg_total_relation_size(table_name::regclass) DESC
        LIMIT 10
      `
        ]);
        const analytics = {
            users: {
                total: totalUsers,
                newThisMonth: newUsersThisMonth,
                activeUsers: activeUsers,
                byRole: usersByRole.reduce((acc, role) => {
                    acc[role.role] = role._count.role;
                    return acc;
                }, {}),
                growth: userGrowthData
            },
            products: {
                total: totalProducts,
                active: activeProducts,
                byCategory: productsByCategory,
                averageRating: averageProductRating._avg.rating || 0,
                topProducts: topProducts.map((product) => ({
                    ...product,
                    averageRating: product.reviews.length > 0
                        ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
                        : 0
                }))
            },
            orders: {
                total: totalOrders,
                completed: completedOrders,
                pending: pendingOrders,
                revenue: totalRevenue._sum.total || 0,
                monthlyOrders: ordersByMonth,
                monthlyRevenue: revenueByMonth
            },
            experts: {
                total: totalExperts,
                active: activeExperts,
                totalConversations,
                totalArticles,
                topExperts: expertEngagement
            },
            system: {
                errorLogs,
                systemAlerts,
                databaseTables: databaseSize
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
    }
    catch (error) {
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
router.get("/dashboard", adminOnlyRoute, async (req, res) => {
    try {
        const today = new Date();
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const [dailyNewUsers, dailyOrders, dailyRevenue, systemHealth, recentActivity] = await Promise.all([
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
                    status: 'COMPLETED',
                    createdAt: { gte: yesterday }
                },
                _sum: { total: true }
            }),
            prisma.alert.count({
                where: {
                    isResolved: false,
                    priority: { in: ['HIGH', 'CRITICAL'] }
                }
            }),
            prisma.user.findMany({
                take: 10,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    email: true,
                    role: true,
                    createdAt: true,
                    profile: {
                        select: {
                            firstName: true,
                            lastName: true
                        }
                    }
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
                        value: dailyRevenue._sum.total || 0
                    },
                    systemHealth: {
                        criticalAlerts: systemHealth,
                        status: systemHealth === 0 ? 'healthy' : 'attention-needed'
                    }
                },
                recentActivity
            }
        });
    }
    catch (error) {
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
router.get("/revenue", adminOnlyRoute, async (req, res) => {
    try {
        const { period = 'month', year = new Date().getFullYear() } = req.query;
        let groupBy;
        let dateRange;
        if (period === 'year') {
            groupBy = { createdAt: 'year' };
            dateRange = {
                gte: new Date(`${year}-01-01`),
                lt: new Date(`${parseInt(year) + 1}-01-01`)
            };
        }
        else {
            groupBy = { createdAt: 'month' };
            dateRange = {
                gte: new Date(`${year}-01-01`),
                lt: new Date(`${parseInt(year) + 1}-01-01`)
            };
        }
        const revenueData = await prisma.order.groupBy({
            by: ['createdAt'],
            _sum: { total: true },
            _count: { id: true },
            where: {
                status: 'COMPLETED',
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
        const productsWithDetails = await Promise.all(topProducts.map(async (item) => {
            const produce = await prisma.produce.findUnique({
                where: { id: item.produceId },
                select: {
                    name: true,
                    farmer: {
                        select: {
                            profile: {
                                select: {
                                    firstName: true,
                                    lastName: true
                                }
                            }
                        }
                    }
                }
            });
            return {
                ...item,
                produce
            };
        }));
        res.json({
            success: true,
            data: {
                revenueTimeline: revenueData,
                topProducts: productsWithDetails,
                period,
                year
            }
        });
    }
    catch (error) {
        console.error("Error fetching revenue analytics:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch revenue analytics"
        });
    }
});
export default router;
