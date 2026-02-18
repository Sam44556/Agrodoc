import { Router } from "express";
import { buyerOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";
const router = Router();
/**
 * GET /api/buyer/browse - Browse available products with filters
 */
router.get("/", buyerOnlyRoute, async (req, res) => {
    try {
        const { search, category, location, minPrice, maxPrice, sortBy = 'createdAt', sortOrder = 'desc', page = 1, limit = 12 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const where = { status: "AVAILABLE" };
        // Apply filters
        if (search) {
            where.name = {
                contains: search,
                mode: 'insensitive'
            };
        }
        if (category) {
            where.category = {
                name: {
                    equals: category,
                    mode: 'insensitive'
                }
            };
        }
        if (location) {
            where.farmer = {
                location: {
                    contains: location,
                    mode: 'insensitive'
                }
            };
        }
        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice)
                where.price.gte = parseFloat(minPrice);
            if (maxPrice)
                where.price.lte = parseFloat(maxPrice);
        }
        // Determine sort criteria
        let orderBy = {};
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
                take: parseInt(limit),
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
        const productsWithStats = products.map((product) => ({
            ...product,
            averageRating: product.reviews.length > 0
                ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length
                : 0,
            reviewCount: product.reviews.length,
            totalSold: product.orderItems.reduce((sum, item) => sum + item.quantity, 0),
            remainingQuantity: product.quantity - product.orderItems.reduce((sum, item) => sum + item.quantity, 0)
        }));
        res.json({
            success: true,
            data: {
                products: productsWithStats,
                pagination: {
                    current: parseInt(page),
                    total: Math.ceil(totalCount / parseInt(limit)),
                    hasNext: skip + parseInt(limit) < totalCount,
                    hasPrev: parseInt(page) > 1,
                    totalCount
                },
                filters: {
                    categories: categories.filter((cat) => cat._count.produce > 0),
                    locations: locations.map((l) => l.location).filter(Boolean)
                }
            }
        });
    }
    catch (error) {
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
router.get("/:id", buyerOnlyRoute, async (req, res) => {
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
                reviews: {
                    include: {
                        reviewer: {
                            select: {
                                name: true,
                                image: true
                            }
                        }
                    },
                    orderBy: {
                        createdAt: "desc"
                    },
                    take: 10
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
        // Calculate additional stats
        const averageRating = product.reviews.length > 0
            ? product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.reviews.length
            : 0;
        const totalSold = product.orderItems.reduce((sum, item) => sum + item.quantity, 0);
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
                },
                reviews: {
                    select: {
                        rating: true
                    }
                }
            }
        });
        const similarProductsWithStats = similarProducts.map((p) => ({
            ...p,
            averageRating: p.reviews.length > 0
                ? p.reviews.reduce((sum, r) => sum + r.rating, 0) / p.reviews.length
                : 0,
            reviewCount: p.reviews.length
        }));
        res.json({
            success: true,
            data: {
                product: {
                    ...product,
                    averageRating,
                    reviewCount: product.reviews.length,
                    totalSold,
                    remainingQuantity
                },
                similarProducts: similarProductsWithStats
            }
        });
    }
    catch (error) {
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
router.post("/:id/favorite", buyerOnlyRoute, async (req, res) => {
    try {
        const buyerId = req.user.id;
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
        }
        else {
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
    }
    catch (error) {
        console.error("Error updating favorites:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update favorites"
        });
    }
});
export default router;
