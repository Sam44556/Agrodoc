import { Router, Request, Response } from "express";
import { prisma } from "../../../utils/prisma";

const router = Router();

/**
 * GET /api/articles - Get published articles for public access
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const {
      search,
      page = 1,
      limit = 10,
      tags
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const where: any = { isPublished: true };

    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { content: { contains: search as string, mode: 'insensitive' } },
        { excerpt: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    if (tags) {
      where.tags = { has: tags as string };
    }

    const [articles, totalCount] = await Promise.all([
      prisma.article.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        skip,
        take: parseInt(limit as string),
        select: {
          id: true,
          title: true,
          excerpt: true,
          content: true,
          tags: true,
          viewCount: true,
          publishedAt: true,
          createdAt: true,
          author: {
            select: {
              id: true,
              name: true,
              expertProfile: {
                select: {
                  rating: true,
                  reviewCount: true
                }
              }
            }
          }
        }
      }),
      prisma.article.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        articles: articles.map((article: { id: any; title: any; excerpt: any; content: any; tags: any; viewCount: any; publishedAt: any; createdAt: any; author: { id: any; name: any; expertProfile: { rating: any; reviewCount: any; }; }; }) => ({
          id: article.id,
          title: article.title,
          excerpt: article.excerpt,
          content: article.content,
          tags: article.tags,
          viewCount: article.viewCount,
          publishedAt: article.publishedAt,
          createdAt: article.createdAt,
          author: {
            id: article.author.id,
            name: article.author.name,
            rating: article.author.expertProfile?.rating || 0,
            reviewCount: article.author.expertProfile?.reviewCount || 0
          }
        })),
        pagination: {
          current: parseInt(page as string),
          total: Math.ceil(totalCount / parseInt(limit as string)),
          count: totalCount,
          limit: parseInt(limit as string)
        }
      }
    });

  } catch (error) {
    console.error("Error fetching published articles:", error);
    res.status(500).json({
      error: "Failed to fetch articles",
      message: "Could not retrieve published articles"
    });
  }
});

export default router;