import { Router } from "express";
import { farmerOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";
const router = Router();
/**
 * GET /api/farmer/dashboard - Get farmer's dashboard overview data
 */
router.get("/", farmerOnlyRoute, async (req, res) => {
    try {
        const farmerId = req.user.id;
        // Get farmer's basic info
        const farmer = await prisma.user.findUnique({
            where: { id: farmerId },
            select: {
                name: true,
                location: true,
                farmerProfile: {
                    select: {
                        totalRevenue: true,
                        activeListings: true,
                        totalSales: true,
                        rating: true
                    }
                }
            }
        });
        // Get listings (recent ones for display)
        const listings = await prisma.produce.findMany({
            where: {
                farmerId: farmerId
            },
            select: {
                id: true,
                name: true,
                price: true,
                quantity: true,
                status: true,
                createdAt: true,
                orderItems: {
                    select: {
                        id: true,
                        quantity: true,
                        order: {
                            select: {
                                status: true,
                                totalAmount: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: "desc"
            },
            take: 10
        });
        // Get orders data
        const orders = await prisma.order.findMany({
            where: {
                orderItems: {
                    some: {
                        produce: {
                            farmerId: farmerId
                        }
                    }
                }
            },
            include: {
                orderItems: {
                    where: {
                        produce: {
                            farmerId: farmerId
                        }
                    },
                    include: {
                        produce: {
                            select: {
                                name: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: "desc"
            },
            take: 10
        });
        // Calculate statistics
        const stats = calculateDashboardStats(listings, orders);
        // Get recent activities - already sorted by createdAt desc from query
        const recentListings = listings.slice(0, 3); // Show 3 most recent listings
        const recentOrders = orders.slice(0, 5);
        // Generate quick insights
        const insights = generateQuickInsights(stats, listings);
        res.json({
            success: true,
            data: {
                farmer: {
                    name: farmer?.name,
                    location: farmer?.location
                },
                stats: stats,
                recentListings: recentListings.map((listing) => ({
                    id: listing.id,
                    name: listing.name,
                    price: listing.price,
                    quantity: listing.quantity,
                    status: listing.status,
                    totalValue: listing.price * listing.quantity,
                    createdAt: listing.createdAt,
                    ordersCount: listing.orderItems?.length || 0
                })),
                recentOrders: recentOrders.map((order) => ({
                    id: order.id,
                    status: order.status,
                    totalAmount: order.totalAmount,
                    itemsCount: order.orderItems.length,
                    items: order.orderItems.map((item) => item.produce.name),
                    createdAt: order.createdAt
                })),
                insights: insights,
                lastUpdated: new Date().toISOString()
            }
        });
    }
    catch (error) {
        console.error("❌ Error fetching dashboard data:", error);
        console.error("Error details:", {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : null
        });
        res.status(500).json({
            error: "Failed to fetch dashboard data",
            message: "Could not retrieve farmer dashboard information",
            details: error instanceof Error ? error.message : String(error)
        });
    }
});
// Helper function to calculate dashboard statistics
function calculateDashboardStats(listings, orders) {
    const totalListings = listings.length;
    const totalInventoryValue = listings.reduce((total, listing) => total + (listing.price * listing.quantity), 0);
    // Calculate orders statistics
    const pendingOrders = orders.filter(order => order.status === "PENDING").length;
    const confirmedOrders = orders.filter(order => order.status === "CONFIRMED").length;
    const completedOrders = orders.filter(order => order.status === "DELIVERED").length;
    // Calculate this month's revenue
    const thisMonth = new Date();
    const startOfMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1);
    const monthlyRevenue = orders
        .filter(order => order.status === "DELIVERED" &&
        new Date(order.createdAt) >= startOfMonth)
        .reduce((total, order) => total + order.totalAmount, 0);
    // Calculate average order value
    const completedOrdersValue = orders
        .filter(order => order.status === "DELIVERED")
        .reduce((total, order) => total + order.totalAmount, 0);
    const averageOrderValue = completedOrders > 0 ? completedOrdersValue / completedOrders : 0;
    // Calculate success rate
    const totalOrdersProcessed = confirmedOrders + completedOrders;
    const successRate = orders.length > 0 ? (completedOrders / orders.length) * 100 : 0;
    return {
        listings: {
            total: totalListings,
            totalValue: Math.round(totalInventoryValue),
            averagePrice: totalListings > 0 ? Math.round(totalInventoryValue / totalListings) : 0
        },
        orders: {
            pending: pendingOrders,
            confirmed: confirmedOrders,
            completed: completedOrders,
            total: orders.length,
            successRate: Math.round(successRate)
        },
        revenue: {
            thisMonth: Math.round(monthlyRevenue),
            averageOrderValue: Math.round(averageOrderValue),
            totalEarnings: Math.round(completedOrdersValue)
        },
        growth: {
            // Calculate growth compared to last month (mock data for now)
            revenueGrowth: Math.round((Math.random() - 0.5) * 20), // -10% to +10%
            ordersGrowth: Math.round((Math.random() - 0.5) * 30), // -15% to +15%
            listingsGrowth: Math.round((Math.random() - 0.3) * 25) // -7.5% to +17.5%
        }
    };
}
// Helper function to generate quick insights
function generateQuickInsights(stats, listings) {
    const insights = [];
    // Revenue insight
    if (stats.revenue.thisMonth > 0) {
        insights.push({
            type: "revenue",
            icon: "💰",
            title: "Monthly Revenue",
            message: `You've earned ${stats.revenue.thisMonth.toLocaleString()} ETB this month`,
            priority: "high"
        });
    }
    // Inventory insight
    if (stats.listings.total === 0) {
        insights.push({
            type: "inventory",
            icon: "📦",
            title: "No Active Listings",
            message: "Add some products to start selling",
            priority: "high",
            action: "Add Listing"
        });
    }
    else if (stats.listings.total > 10) {
        insights.push({
            type: "inventory",
            icon: "📈",
            title: "Great Inventory",
            message: `You have ${stats.listings.total} products listed`,
            priority: "info"
        });
    }
    // Orders insight
    if (stats.orders.pending > 0) {
        insights.push({
            type: "orders",
            icon: "🛒",
            title: "Pending Orders",
            message: `${stats.orders.pending} orders waiting for your response`,
            priority: "warning",
            action: "View Orders"
        });
    }
    // Performance insight
    if (stats.orders.successRate > 90) {
        insights.push({
            type: "performance",
            icon: "⭐",
            title: "Excellent Performance",
            message: `${stats.orders.successRate}% order completion rate`,
            priority: "success"
        });
    }
    else if (stats.orders.successRate < 70) {
        insights.push({
            type: "performance",
            icon: "⚠️",
            title: "Improve Performance",
            message: `${stats.orders.successRate}% completion rate - consider faster responses`,
            priority: "warning"
        });
    }
    // Growth insight
    if (stats.growth.revenueGrowth > 10) {
        insights.push({
            type: "growth",
            icon: "📊",
            title: "Revenue Growing",
            message: `Revenue increased by ${stats.growth.revenueGrowth}% this month`,
            priority: "success"
        });
    }
    return insights.slice(0, 4); // Return max 4 insights
}
export default router;
