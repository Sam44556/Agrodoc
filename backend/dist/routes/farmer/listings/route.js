import { Router } from "express";
import { farmerOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";
const router = Router();
/**
 * GET /api/farmer/listings - Get farmer's product listings
 */
router.get("/", farmerOnlyRoute, async (req, res) => {
    try {
        const farmerId = req.user.id;
        const listings = await prisma.produce.findMany({
            where: {
                farmerId: farmerId,
                status: "AVAILABLE"
            },
            orderBy: {
                createdAt: "desc"
            },
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
        res.json({
            success: true,
            data: listings,
            count: listings.length
        });
    }
    catch (error) {
        console.error("❌ Error fetching farmer listings:", error);
        res.status(500).json({
            error: "Failed to fetch listings",
            message: "Could not retrieve your product listings"
        });
    }
});
/**
 * POST /api/farmer/listings - Create new product listing
 */
router.post("/", farmerOnlyRoute, async (req, res) => {
    try {
        const farmerId = req.user.id;
        const { name, description, price, quantity, categoryId, images } = req.body;
        // Validate required fields
        if (!name || !price || !quantity || !categoryId) {
            return res.status(400).json({
                error: "Missing required fields",
                message: "Name, price, quantity, and category are required"
            });
        }
        const listing = await prisma.produce.create({
            data: {
                farmerId,
                name,
                description: description || null,
                price: parseFloat(price),
                quantity: parseFloat(quantity),
                categoryId,
                images: images || [],
                status: "AVAILABLE"
            },
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
        res.status(201).json({
            success: true,
            data: listing,
            message: "Product listing created successfully"
        });
    }
    catch (error) {
        console.error("❌ Error creating listing:", error);
        res.status(500).json({
            error: "Failed to create listing",
            message: "Could not create your product listing"
        });
    }
});
/**
 * PUT /api/farmer/listings/:id - Update existing listing
 */
router.put("/:id", farmerOnlyRoute, async (req, res) => {
    try {
        const farmerId = req.user.id;
        const listingId = req.params.id;
        const { name, description, price, quantity, categoryId, images, status } = req.body;
        // Check if listing exists and belongs to farmer
        const existingListing = await prisma.produce.findFirst({
            where: {
                id: listingId,
                farmerId: farmerId
            }
        });
        if (!existingListing) {
            return res.status(404).json({
                error: "Listing not found",
                message: "This listing does not exist or you don't have permission to edit it"
            });
        }
        const updatedListing = await prisma.produce.update({
            where: {
                id: listingId
            },
            data: {
                ...(name && { name }),
                ...(description !== undefined && { description }),
                ...(price && { price: parseFloat(price) }),
                ...(quantity && { quantity: parseFloat(quantity) }),
                ...(categoryId && { categoryId }),
                ...(images && { images }),
                ...(status && { status }),
                updatedAt: new Date()
            },
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
        res.json({
            success: true,
            data: updatedListing,
            message: "Listing updated successfully"
        });
    }
    catch (error) {
        console.error("❌ Error updating listing:", error);
        res.status(500).json({
            error: "Failed to update listing",
            message: "Could not update your product listing"
        });
    }
});
/**
 * DELETE /api/farmer/listings/:id - Delete/deactivate listing
 */
router.delete("/:id", farmerOnlyRoute, async (req, res) => {
    try {
        const farmerId = req.user.id;
        const listingId = req.params.id;
        // Check if listing exists and belongs to farmer
        const existingListing = await prisma.produce.findFirst({
            where: {
                id: listingId,
                farmerId: farmerId
            }
        });
        if (!existingListing) {
            return res.status(404).json({
                error: "Listing not found",
                message: "This listing does not exist or you don't have permission to delete it"
            });
        }
        // Soft delete by setting status to INACTIVE
        await prisma.produce.update({
            where: {
                id: listingId
            },
            data: {
                status: "INACTIVE",
                updatedAt: new Date()
            }
        });
        res.json({
            success: true,
            message: "Listing deleted successfully"
        });
    }
    catch (error) {
        console.error("❌ Error deleting listing:", error);
        res.status(500).json({
            error: "Failed to delete listing",
            message: "Could not delete your product listing"
        });
    }
});
export default router;
