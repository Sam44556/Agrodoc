import { Router, Request, Response } from "express";
import { farmerOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";

const router = Router();

/**
 * GET /api/farmer/experts - Browse experts with profile details
 */
router.get("/", farmerOnlyRoute, async (req: Request, res: Response) => {
  try {
    const experts = await prisma.user.findMany({
      where: { role: "EXPERT" },
      select: {
        id: true,
        name: true,
        image: true,
        location: true,
        expertProfile: {
          select: {
            rating: true,
            reviewCount: true,
            hourlyRate: true,
            expertise: true,
            portfolio: true,
            conversationCount: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const data = experts.map((expert) => ({
      id: expert.id,
      name: expert.name || "Expert",
      image: expert.image || null,
      location: expert.location || "",
      rating: expert.expertProfile?.rating || 0,
      reviewCount: expert.expertProfile?.reviewCount || 0,
      hourlyRate: expert.expertProfile?.hourlyRate || 0,
      expertise: expert.expertProfile?.expertise || [],
      portfolio: expert.expertProfile?.portfolio || [],
      conversationCount: expert.expertProfile?.conversationCount || 0
    }));

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error("Error fetching experts:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch experts"
    });
  }
});

export default router;
