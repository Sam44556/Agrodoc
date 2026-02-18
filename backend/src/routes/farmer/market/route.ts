import { Router, Request, Response } from "express";
import { farmerOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";

const router = Router();

/**
 * GET /api/farmer/market - Get market prices
 */
router.get("/", farmerOnlyRoute, async (req: Request, res: Response) => {
  try {
    const { crop, search, region, limit = 50 } = req.query;
    const where: any = {};

    if (crop) {
      where.cropName = { contains: crop as string, mode: "insensitive" };
    }

    if (search) {
      where.cropName = { contains: search as string, mode: "insensitive" };
    }

    if (region) {
      where.region = { contains: region as string, mode: "insensitive" };
    }

    const prices = await prisma.marketPrice.findMany({
      where,
      orderBy: {
        updatedAt: "desc"
      },
      take: Math.min(Number(limit), 100)
    });

    res.json({
      success: true,
      data: prices,
      count: prices.length
    });
  } catch (error) {
    console.error("❌ Error fetching market prices:", error);
    res.status(500).json({
      error: "Failed to fetch market prices",
      message: "Could not retrieve market prices"
    });
  }
});

export default router;
