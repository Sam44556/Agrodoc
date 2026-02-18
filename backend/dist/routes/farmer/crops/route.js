import { Router } from "express";
import { farmerOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";
const router = Router();
/**
 * GET /api/farmer/crops - Get farmer's crop listings
 */
router.get("/", farmerOnlyRoute, async (req, res) => {
    try {
        const farmerId = req.user.id;
        const { status, search } = req.query;
        console.log("📦 Fetching crops for farmer:", farmerId, { status, search });
        const where = { farmerId };
        if (status && status !== 'all') {
            where.status = status;
        }
        if (search) {
            where.name = {
                contains: search,
                mode: 'insensitive'
            };
        }
        const crops = await prisma.produce.findMany({
            where,
            orderBy: {
                createdAt: "desc"
            },
            include: {
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
        });
        console.log("✅ Found", crops.length, "crops for farmer");
        // Add computed fields
        const cropsWithStats = crops.map((crop) => ({
            ...crop,
            views: Math.floor(Math.random() * 200) + 10, // Mock data
            inquiries: Math.floor(Math.random() * 20) + 1, // Mock data
            totalSold: crop.orderItems.reduce((sum, item) => sum + item.quantity, 0)
        }));
        res.json({
            success: true,
            data: cropsWithStats
        });
    }
    catch (error) {
        console.error("❌ Error fetching crops:", error);
        console.error("Error details:", {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : null
        });
        res.status(500).json({
            success: false,
            message: "Failed to fetch crops",
            details: error instanceof Error ? error.message : String(error)
        });
    }
});
/**
 * GET /api/farmer/crops/recent - Get farmer's 3 most recent crop listings
 */
router.get("/recent", farmerOnlyRoute, async (req, res) => {
    try {
        const farmerId = req.user.id;
        console.log("📦 Fetching recent crops for farmer:", farmerId);
        const recentCrops = await prisma.produce.findMany({
            where: { farmerId },
            orderBy: {
                createdAt: "desc"
            },
            take: 3,
            select: {
                id: true,
                name: true,
                price: true,
                quantity: true,
                status: true,
                createdAt: true,
                orderItems: {
                    select: {
                        quantity: true
                    }
                }
            }
        });
        console.log("✅ Found", recentCrops.length, "recent crops");
        const data = recentCrops.map((crop) => ({
            id: crop.id,
            name: crop.name,
            price: crop.price,
            quantity: crop.quantity,
            status: crop.status,
            totalValue: crop.price * crop.quantity,
            createdAt: crop.createdAt,
            ordersCount: crop.orderItems.length
        }));
        res.json({
            success: true,
            data
        });
    }
    catch (error) {
        console.error("❌ Error fetching recent crops:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch recent crops"
        });
    }
});
/**
 * POST /api/farmer/crops - Create new crop listing
 */
router.post("/", farmerOnlyRoute, async (req, res) => {
    try {
        const farmerId = req.user.id;
        const { name, description, price, quantity, categoryName, images, unit = "quintal" } = req.body;
        // Validate required fields
        if (!name || !price || !quantity || !categoryName) {
            return res.status(400).json({
                success: false,
                message: "Name, price, quantity, and category are required"
            });
        }
        // Validate price and quantity
        if (price <= 0 || quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: "Price and quantity must be positive numbers"
            });
        }
        // Find or create category
        let category = await prisma.category.findFirst({
            where: {
                name: {
                    equals: categoryName,
                    mode: 'insensitive'
                }
            }
        });
        if (!category) {
            category = await prisma.category.create({
                data: { name: categoryName }
            });
        }
        // Create the crop listing
        const crop = await prisma.produce.create({
            data: {
                name,
                description,
                price: parseFloat(price),
                quantity: parseFloat(quantity),
                farmerId,
                categoryId: category.id,
                images: images || [],
                status: "AVAILABLE"
            },
            include: {
                category: {
                    select: {
                        name: true
                    }
                },
                farmer: {
                    select: {
                        name: true,
                        location: true
                    }
                }
            }
        });
        res.status(201).json({
            success: true,
            message: "Crop listing created successfully",
            data: crop
        });
    }
    catch (error) {
        console.error("Error creating crop:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create crop listing"
        });
    }
});
/**
 * PUT /api/farmer/crops/:id - Update existing crop listing
 */
router.put("/:id", farmerOnlyRoute, async (req, res) => {
    try {
        const farmerId = req.user.id;
        const cropId = req.params.id;
        const { name, description, price, quantity, categoryName, images, status } = req.body;
        // Check if crop belongs to farmer
        const existingCrop = await prisma.produce.findFirst({
            where: {
                id: cropId,
                farmerId
            }
        });
        if (!existingCrop) {
            return res.status(404).json({
                success: false,
                message: "Crop not found or you don't have permission to edit it"
            });
        }
        // Validate values if provided
        if (price !== undefined && price <= 0) {
            return res.status(400).json({
                success: false,
                message: "Price must be a positive number"
            });
        }
        if (quantity !== undefined && quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: "Quantity must be a positive number"
            });
        }
        // Handle category update
        let categoryId = existingCrop.categoryId;
        if (categoryName) {
            let category = await prisma.category.findFirst({
                where: {
                    name: {
                        equals: categoryName,
                        mode: 'insensitive'
                    }
                }
            });
            if (!category) {
                category = await prisma.category.create({
                    data: { name: categoryName }
                });
            }
            categoryId = category.id;
        }
        // Update the crop
        const updatedCrop = await prisma.produce.update({
            where: { id: cropId },
            data: {
                ...(name !== undefined && { name }),
                ...(description !== undefined && { description }),
                ...(price !== undefined && { price: parseFloat(price) }),
                ...(quantity !== undefined && { quantity: parseFloat(quantity) }),
                ...(categoryName !== undefined && { categoryId }),
                ...(images !== undefined && { images }),
                ...(status !== undefined && { status }),
                updatedAt: new Date()
            },
            include: {
                category: {
                    select: {
                        name: true
                    }
                },
                farmer: {
                    select: {
                        name: true,
                        location: true
                    }
                }
            }
        });
        res.json({
            success: true,
            message: "Crop listing updated successfully",
            data: updatedCrop
        });
    }
    catch (error) {
        console.error("Error updating crop:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update crop listing"
        });
    }
});
/**
 * DELETE /api/farmer/crops/:id - Delete crop listing
 */
router.delete("/:id", farmerOnlyRoute, async (req, res) => {
    try {
        const farmerId = req.user.id;
        const cropId = req.params.id;
        // Check if crop belongs to farmer
        const existingCrop = await prisma.produce.findFirst({
            where: {
                id: cropId,
                farmerId
            }
        });
        if (!existingCrop) {
            return res.status(404).json({
                success: false,
                message: "Crop not found or you don't have permission to delete it"
            });
        }
        // Check if there are pending orders
        const pendingOrders = await prisma.orderItem.findMany({
            where: {
                produceId: cropId,
                order: {
                    status: "PENDING"
                }
            }
        });
        if (pendingOrders.length > 0) {
            // Soft delete by marking as inactive
            await prisma.produce.update({
                where: { id: cropId },
                data: { status: "INACTIVE" }
            });
            return res.json({
                success: true,
                message: "Crop listing deactivated due to pending orders"
            });
        }
        // Hard delete if no pending orders
        await prisma.produce.delete({
            where: { id: cropId }
        });
        res.json({
            success: true,
            message: "Crop listing deleted successfully"
        });
    }
    catch (error) {
        console.error("Error deleting crop:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete crop listing"
        });
    }
});
/**
 * PATCH /api/farmer/crops/:id/status - Update crop status
 */
router.patch("/:id/status", farmerOnlyRoute, async (req, res) => {
    try {
        const farmerId = req.user.id;
        const cropId = req.params.id;
        const { status } = req.body;
        if (!status || !["AVAILABLE", "SOLD_OUT", "INACTIVE"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Valid status is required (AVAILABLE, SOLD_OUT, INACTIVE)"
            });
        }
        // Check if crop belongs to farmer
        const existingCrop = await prisma.produce.findFirst({
            where: {
                id: cropId,
                farmerId
            }
        });
        if (!existingCrop) {
            return res.status(404).json({
                success: false,
                message: "Crop not found or you don't have permission to update it"
            });
        }
        const updatedCrop = await prisma.produce.update({
            where: { id: cropId },
            data: {
                status,
                updatedAt: new Date()
            }
        });
        res.json({
            success: true,
            message: `Crop status updated to ${status}`,
            data: updatedCrop
        });
    }
    catch (error) {
        console.error("Error updating crop status:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update crop status"
        });
    }
});
/**
 * GET /api/farmer/crops/statistics - Get crop statistics
 */
router.get("/statistics", farmerOnlyRoute, async (req, res) => {
    try {
        const farmerId = req.user.id;
        // Get crop counts by status
        const [activeCrops, soldOutCrops, inactiveCrops, totalRevenue, totalQuantitySold] = await Promise.all([
            prisma.produce.count({
                where: { farmerId, status: "AVAILABLE" }
            }),
            prisma.produce.count({
                where: { farmerId, status: "SOLD_OUT" }
            }),
            prisma.produce.count({
                where: { farmerId, status: "INACTIVE" }
            }),
            prisma.orderItem.aggregate({
                where: {
                    produce: { farmerId }
                },
                _sum: {
                    price: true
                }
            }),
            prisma.orderItem.aggregate({
                where: {
                    produce: { farmerId }
                },
                _sum: {
                    quantity: true
                }
            })
        ]);
        // Get recent sales (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recentSales = await prisma.orderItem.count({
            where: {
                produce: { farmerId },
                createdAt: {
                    gte: sevenDaysAgo
                }
            }
        });
        // Get top performing crops
        const topCrops = await prisma.produce.findMany({
            where: { farmerId },
            include: {
                orderItems: true,
                reviews: true
            },
            take: 5
        });
        const topPerformingCrops = topCrops
            .map((crop) => ({
            name: crop.name,
            totalSold: crop.orderItems.reduce((sum, item) => sum + item.quantity, 0),
            revenue: crop.orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0),
            averageRating: crop.reviews.length > 0
                ? crop.reviews.reduce((sum, r) => sum + r.rating, 0) / crop.reviews.length
                : 0
        }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 3);
        res.json({
            success: true,
            data: {
                activeListings: activeCrops,
                soldOut: soldOutCrops,
                inactive: inactiveCrops,
                totalRevenue: totalRevenue._sum.price || 0,
                totalQuantitySold: totalQuantitySold._sum.quantity || 0,
                recentSales,
                topPerformingCrops
            }
        });
    }
    catch (error) {
        console.error("Error fetching crop statistics:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch crop statistics"
        });
    }
});
export default router;
