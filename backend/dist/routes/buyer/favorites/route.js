import { Router } from "express";
import { buyerOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";
const router = Router();
/**
 * GET /api/buyer/favorites - Get buyer's favorite products
 */
router.get("/", buyerOnlyRoute, async (req, res) => {
    try {
        const buyerId = req.user.id;
        const { page = 1, limit = 12 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [favorites, totalCount] = await Promise.all([
            prisma.favorite.findMany({
                where: { buyerId },
                orderBy: { createdAt: "desc" },
                skip,
                take: parseInt(limit),
                include: {
                    produce: {
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
                            reviews: {
                                select: {
                                    rating: true
                                }
                            },
                            orderItems: {
                                select: {
                                    quantity: true
                                }
                            }
                        }
                    }
                }
            }),
            prisma.favorite.count({ where: { buyerId } })
        ]);
        // Add computed fields and filter out unavailable products
        const favoritesWithStats = favorites
            .filter((fav) => fav.produce.status === "AVAILABLE")
            .map((favorite) => ({
            id: favorite.id,
            addedAt: favorite.createdAt,
            product: {
                ...favorite.produce,
                averageRating: favorite.produce.reviews.length > 0
                    ? favorite.produce.reviews.reduce((sum, r) => sum + r.rating, 0) / favorite.produce.reviews.length
                    : 0,
                reviewCount: favorite.produce.reviews.length,
                totalSold: favorite.produce.orderItems.reduce((sum, item) => sum + item.quantity, 0),
                remainingQuantity: favorite.produce.quantity - favorite.produce.orderItems.reduce((sum, item) => sum + item.quantity, 0)
            }
        }));
        res.json({
            success: true,
            data: {
                favorites: favoritesWithStats,
                pagination: {
                    current: parseInt(page),
                    total: Math.ceil(totalCount / parseInt(limit)),
                    hasNext: skip + parseInt(limit) < totalCount,
                    hasPrev: parseInt(page) > 1,
                    totalCount
                }
            }
        });
    }
    catch (error) {
        console.error("Error fetching favorites:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch favorite products"
        });
    }
});
/**
 * DELETE /api/buyer/favorites/:id - Remove product from favorites
 */
router.delete("/:id", buyerOnlyRoute, async (req, res) => {
    try {
        const buyerId = req.user.id;
        const favoriteId = req.params.id;
        // Check if favorite belongs to buyer
        const favorite = await prisma.favorite.findFirst({
            where: {
                id: favoriteId,
                buyerId
            }
        });
        if (!favorite) {
            return res.status(404).json({
                success: false,
                message: "Favorite not found or you don't have permission to remove it"
            });
        }
        // Remove from favorites
        await prisma.favorite.delete({
            where: { id: favoriteId }
        });
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
        res.json({
            success: true,
            message: "Removed from favorites"
        });
    }
    catch (error) {
        console.error("Error removing favorite:", error);
        res.status(500).json({
            success: false,
            message: "Failed to remove favorite"
        });
    }
});
/**
 * DELETE /api/buyer/favorites - Clear all favorites
 */
router.delete("/", buyerOnlyRoute, async (req, res) => {
    try {
        const buyerId = req.user.id;
        // Remove all favorites for this buyer
        const deletedCount = await prisma.favorite.deleteMany({
            where: { buyerId }
        });
        // Update buyer profile favorite count
        await prisma.buyerProfile.upsert({
            where: { userId: buyerId },
            update: { favoriteCount: 0 },
            create: {
                userId: buyerId,
                favoriteCount: 0,
                totalOrders: 0,
                totalSpent: 0
            }
        });
        res.json({
            success: true,
            message: `Cleared ${deletedCount.count} favorites`,
            deletedCount: deletedCount.count
        });
    }
    catch (error) {
        console.error("Error clearing favorites:", error);
        res.status(500).json({
            success: false,
            message: "Failed to clear favorites"
        });
    }
});
/**
 * POST /api/buyer/favorites/bulk - Add multiple products to favorites
 */
router.post("/bulk", buyerOnlyRoute, async (req, res) => {
    try {
        const buyerId = req.user.id;
        const { productIds } = req.body;
        if (!Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Product IDs array is required"
            });
        }
        // Validate that all products exist and are available
        const products = await prisma.produce.findMany({
            where: {
                id: {
                    in: productIds
                },
                status: "AVAILABLE"
            }
        });
        if (products.length !== productIds.length) {
            return res.status(400).json({
                success: false,
                message: "Some products were not found or are not available"
            });
        }
        // Get existing favorites to avoid duplicates
        const existingFavorites = await prisma.favorite.findMany({
            where: {
                buyerId,
                produceId: {
                    in: productIds
                }
            },
            select: { produceId: true }
        });
        const existingProductIds = existingFavorites.map((f) => f.produceId);
        const newProductIds = productIds.filter(id => !existingProductIds.includes(id));
        // Add new favorites
        if (newProductIds.length > 0) {
            await prisma.favorite.createMany({
                data: newProductIds.map(productId => ({
                    buyerId,
                    produceId: productId
                }))
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
        res.json({
            success: true,
            message: `Added ${newProductIds.length} new favorites`,
            addedCount: newProductIds.length,
            duplicateCount: existingProductIds.length
        });
    }
    catch (error) {
        console.error("Error adding bulk favorites:", error);
        res.status(500).json({
            success: false,
            message: "Failed to add favorites"
        });
    }
});
export default router;
