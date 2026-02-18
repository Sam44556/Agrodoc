import { Router } from "express";
import { expertOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";
const router = Router();
/**
 * GET /api/expert/articles - Get expert's articles
 */
router.get("/", expertOnlyRoute, async (req, res) => {
    try {
        const expertId = req.user.id;
        const { status = 'all', search, page = 1, limit = 10 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const where = { authorId: expertId };
        // Apply filters
        if (status !== 'all') {
            where.isPublished = status === 'published';
        }
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { content: { contains: search, mode: 'insensitive' } },
                { tags: { has: search } }
            ];
        }
        const [articles, totalCount] = await Promise.all([
            prisma.article.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: parseInt(limit),
                select: {
                    id: true,
                    title: true,
                    excerpt: true,
                    coverImage: true,
                    tags: true,
                    isPublished: true,
                    viewCount: true,
                    publishedAt: true,
                    createdAt: true,
                    updatedAt: true
                }
            }),
            prisma.article.count({ where })
        ]);
        // Get article statistics
        const [publishedCount, draftCount, totalViews] = await Promise.all([
            prisma.article.count({
                where: { authorId: expertId, isPublished: true }
            }),
            prisma.article.count({
                where: { authorId: expertId, isPublished: false }
            }),
            prisma.article.aggregate({
                where: { authorId: expertId },
                _sum: { viewCount: true }
            })
        ]);
        res.json({
            success: true,
            data: {
                articles,
                pagination: {
                    current: parseInt(page),
                    total: Math.ceil(totalCount / parseInt(limit)),
                    hasNext: skip + parseInt(limit) < totalCount,
                    totalCount
                },
                statistics: {
                    total: totalCount,
                    published: publishedCount,
                    drafts: draftCount,
                    totalViews: totalViews._sum.viewCount || 0
                }
            }
        });
    }
    catch (error) {
        console.error("Error fetching articles:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch articles"
        });
    }
});
/**
 * GET /api/expert/articles/:id - Get specific article
 */
router.get("/:id", expertOnlyRoute, async (req, res) => {
    try {
        const expertId = req.user.id;
        const articleId = req.params.id;
        const article = await prisma.article.findFirst({
            where: {
                id: articleId,
                authorId: expertId
            }
        });
        if (!article) {
            return res.status(404).json({
                success: false,
                message: "Article not found or you don't have permission to view it"
            });
        }
        res.json({
            success: true,
            data: article
        });
    }
    catch (error) {
        console.error("Error fetching article:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch article"
        });
    }
});
/**
 * POST /api/expert/articles - Create new article
 */
router.post("/", expertOnlyRoute, async (req, res) => {
    try {
        const expertId = req.user.id;
        const { title, content, excerpt, coverImage, tags = [], isPublished = false } = req.body;
        // Validate required fields
        if (!title || !content) {
            return res.status(400).json({
                success: false,
                message: "Title and content are required"
            });
        }
        // Create article
        const article = await prisma.article.create({
            data: {
                title,
                content,
                excerpt,
                coverImage,
                tags: Array.isArray(tags) ? tags : [],
                isPublished,
                authorId: expertId,
                publishedAt: isPublished ? new Date() : null,
                viewCount: 0
            }
        });
        res.status(201).json({
            success: true,
            message: "Article created successfully",
            data: article
        });
    }
    catch (error) {
        console.error("Error creating article:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create article"
        });
    }
});
/**
 * PUT /api/expert/articles/:id - Update article
 */
router.put("/:id", expertOnlyRoute, async (req, res) => {
    try {
        const expertId = req.user.id;
        const articleId = req.params.id;
        const { title, content, excerpt, coverImage, tags, isPublished } = req.body;
        // Check if article belongs to expert
        const existingArticle = await prisma.article.findFirst({
            where: {
                id: articleId,
                authorId: expertId
            }
        });
        if (!existingArticle) {
            return res.status(404).json({
                success: false,
                message: "Article not found or you don't have permission to edit it"
            });
        }
        // Prepare update data
        const updateData = {
            updatedAt: new Date()
        };
        if (title !== undefined)
            updateData.title = title;
        if (content !== undefined)
            updateData.content = content;
        if (excerpt !== undefined)
            updateData.excerpt = excerpt;
        if (coverImage !== undefined)
            updateData.coverImage = coverImage;
        if (tags !== undefined)
            updateData.tags = Array.isArray(tags) ? tags : [];
        // Handle publishing status
        if (isPublished !== undefined) {
            updateData.isPublished = isPublished;
            // Set publishedAt when publishing for the first time
            if (isPublished && !existingArticle.isPublished) {
                updateData.publishedAt = new Date();
            }
            // Clear publishedAt when unpublishing
            if (!isPublished && existingArticle.isPublished) {
                updateData.publishedAt = null;
            }
        }
        const updatedArticle = await prisma.article.update({
            where: { id: articleId },
            data: updateData
        });
        res.json({
            success: true,
            message: "Article updated successfully",
            data: updatedArticle
        });
    }
    catch (error) {
        console.error("Error updating article:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update article"
        });
    }
});
/**
 * DELETE /api/expert/articles/:id - Delete article
 */
router.delete("/:id", expertOnlyRoute, async (req, res) => {
    try {
        const expertId = req.user.id;
        const articleId = req.params.id;
        // Check if article belongs to expert
        const existingArticle = await prisma.article.findFirst({
            where: {
                id: articleId,
                authorId: expertId
            }
        });
        if (!existingArticle) {
            return res.status(404).json({
                success: false,
                message: "Article not found or you don't have permission to delete it"
            });
        }
        await prisma.article.delete({
            where: { id: articleId }
        });
        res.json({
            success: true,
            message: "Article deleted successfully"
        });
    }
    catch (error) {
        console.error("Error deleting article:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete article"
        });
    }
});
/**
 * PATCH /api/expert/articles/:id/publish - Toggle publish status
 */
router.patch("/:id/publish", expertOnlyRoute, async (req, res) => {
    try {
        const expertId = req.user.id;
        const articleId = req.params.id;
        // Check if article belongs to expert
        const existingArticle = await prisma.article.findFirst({
            where: {
                id: articleId,
                authorId: expertId
            }
        });
        if (!existingArticle) {
            return res.status(404).json({
                success: false,
                message: "Article not found or you don't have permission to modify it"
            });
        }
        const newPublishedStatus = !existingArticle.isPublished;
        const updatedArticle = await prisma.article.update({
            where: { id: articleId },
            data: {
                isPublished: newPublishedStatus,
                publishedAt: newPublishedStatus ? new Date() : null,
                updatedAt: new Date()
            }
        });
        res.json({
            success: true,
            message: newPublishedStatus ? "Article published" : "Article unpublished",
            data: updatedArticle
        });
    }
    catch (error) {
        console.error("Error toggling publish status:", error);
        res.status(500).json({
            success: false,
            message: "Failed to toggle publish status"
        });
    }
});
export default router;
