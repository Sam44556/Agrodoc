import { Router } from "express";
import { adminOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";
const router = Router();
/**
 * GET /api/admin/market - Get market overview and product management
 */
router.get("/", adminOnlyRoute, async (req, res) => {
    try {
        const { status = 'all', category, search, page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const where = {};
        // Apply filters
        if (status !== 'all') {
            where.status = status;
        }
        if (category) {
            where.categoryId = category;
        }
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
            ];
        }
        const orderBy = {};
        orderBy[sortBy] = sortOrder;
        const [products, totalCount, categories] = await Promise.all([
            prisma.produce.findMany({
                where,
                orderBy,
                skip,
                take: parseInt(limit),
                include: {
                    farmer: {
                        select: {
                            id: true,
                            email: true,
                            profile: {
                                select: {
                                    firstName: true,
                                    lastName: true
                                }
                            }
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
                            reviews: true,
                            OrderItem: true
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
        const [totalProducts, activeProducts, pendingApproval, flaggedProducts, totalRevenue] = await Promise.all([
            prisma.produce.count(),
            prisma.produce.count({ where: { status: 'AVAILABLE' } }),
            prisma.produce.count({ where: { status: 'PENDING' } }),
            prisma.produce.count({ where: { status: 'FLAGGED' } }),
            prisma.orderItem.aggregate({
                _sum: { price: true },
                where: {
                    order: { status: 'COMPLETED' }
                }
            })
        ]);
        res.json({
            success: true,
            data: {
                products,
                pagination: {
                    current: parseInt(page),
                    total: Math.ceil(totalCount / parseInt(limit)),
                    hasNext: skip + parseInt(limit) < totalCount,
                    totalCount
                },
                categories,
                statistics: {
                    totalProducts,
                    activeProducts,
                    pendingApproval,
                    flaggedProducts,
                    totalRevenue: totalRevenue._sum.price || 0
                }
            }
        });
    }
    catch (error) {
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
router.get("/:id", adminOnlyRoute, async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await prisma.produce.findUnique({
            where: { id: productId },
            include: {
                farmer: {
                    select: {
                        id: true,
                        email: true,
                        profile: {
                            select: {
                                firstName: true,
                                lastName: true,
                                phone: true,
                                address: true
                            }
                        }
                    }
                },
                category: true,
                reviews: {
                    include: {
                        user: {
                            select: {
                                profile: {
                                    select: {
                                        firstName: true,
                                        lastName: true
                                    }
                                }
                            }
                        }
                    },
                    orderBy: { createdAt: 'desc' }
                },
                OrderItem: {
                    include: {
                        order: {
                            select: {
                                id: true,
                                status: true,
                                createdAt: true,
                                buyer: {
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
        const totalQuantitySold = product.OrderItem.reduce((sum, item) => sum + item.quantity, 0);
        const totalRevenue = product.OrderItem.reduce((sum, item) => sum + item.price, 0);
        const averageRating = product.reviews.length > 0
            ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
            : 0;
        res.json({
            success: true,
            data: {
                ...product,
                statistics: {
                    totalQuantitySold,
                    totalRevenue,
                    averageRating,
                    totalReviews: product.reviews.length,
                    totalOrders: product.OrderItem.length
                }
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
 * PATCH /api/admin/market/:id/approve - Approve pending product
 */
router.patch("/:id/approve", adminOnlyRoute, async (req, res) => {
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
        if (product.status !== 'PENDING') {
            return res.status(400).json({
                success: false,
                message: "Product is not pending approval"
            });
        }
        const updatedProduct = await prisma.produce.update({
            where: { id: productId },
            data: {
                status: 'AVAILABLE',
                approvedAt: new Date(),
                approvedBy: req.user.id
            },
            include: {
                farmer: {
                    select: {
                        profile: {
                            select: { firstName: true, lastName: true }
                        }
                    }
                }
            }
        });
        res.json({
            success: true,
            message: "Product approved successfully",
            data: updatedProduct
        });
    }
    catch (error) {
        console.error("Error approving product:", error);
        res.status(500).json({
            success: false,
            message: "Failed to approve product"
        });
    }
});
/**
 * PATCH /api/admin/market/:id/flag - Flag product for review
 */
router.patch("/:id/flag", adminOnlyRoute, async (req, res) => {
    try {
        const productId = req.params.id;
        const { reason } = req.body;
        if (!reason) {
            return res.status(400).json({
                success: false,
                message: "Reason for flagging is required"
            });
        }
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
                status: 'FLAGGED',
                flaggedReason: reason,
                flaggedAt: new Date(),
                flaggedBy: req.user.id
            },
            include: {
                farmer: {
                    select: {
                        profile: {
                            select: { firstName: true, lastName: true }
                        }
                    }
                }
            }
        });
        res.json({
            success: true,
            message: "Product flagged successfully",
            data: updatedProduct
        });
    }
    catch (error) {
        console.error("Error flagging product:", error);
        res.status(500).json({
            success: false,
            message: "Failed to flag product"
        });
    }
});
/**
 * PATCH /api/admin/market/:id/unflag - Remove flag from product
 */
router.patch("/:id/unflag", adminOnlyRoute, async (req, res) => {
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
        if (product.status !== 'FLAGGED') {
            return res.status(400).json({
                success: false,
                message: "Product is not flagged"
            });
        }
        const updatedProduct = await prisma.produce.update({
            where: { id: productId },
            data: {
                status: 'AVAILABLE',
                flaggedReason: null,
                flaggedAt: null,
                flaggedBy: null
            },
            include: {
                farmer: {
                    select: {
                        profile: {
                            select: { firstName: true, lastName: true }
                        }
                    }
                }
            }
        });
        res.json({
            success: true,
            message: "Product unflagged successfully",
            data: updatedProduct
        });
    }
    catch (error) {
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
router.delete("/:id", adminOnlyRoute, async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await prisma.produce.findUnique({
            where: { id: productId },
            include: {
                _count: {
                    select: {
                        OrderItem: true
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
        if (product._count.OrderItem > 0) {
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
    }
    catch (error) {
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
router.get("/categories", adminOnlyRoute, async (req, res) => {
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
    }
    catch (error) {
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
router.post("/categories", adminOnlyRoute, async (req, res) => {
    try {
        const { name, description } = req.body;
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
                name,
                description: description || ''
            }
        });
        res.status(201).json({
            success: true,
            message: "Category created successfully",
            data: category
        });
    }
    catch (error) {
        console.error("Error creating category:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create category"
        });
    }
});
export default router;
