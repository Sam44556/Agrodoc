import { Router } from "express";
import { adminOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";
const router = Router();
/**
 * GET /api/admin/alerts - Get system alerts
 */
router.get("/", adminOnlyRoute, async (req, res) => {
    try {
        const { status = 'all', priority = 'all', category = 'all', page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const where = {};
        // Apply filters
        if (status !== 'all') {
            where.isResolved = status === 'resolved';
        }
        if (priority !== 'all') {
            where.priority = priority;
        }
        if (category !== 'all') {
            where.category = category;
        }
        const [alerts, totalCount] = await Promise.all([
            prisma.alert.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit),
                include: {
                    resolvedBy: {
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
                    }
                }
            }),
            prisma.alert.count({ where })
        ]);
        // Get alert statistics
        const [criticalAlerts, highAlerts, unresolvedAlerts, resolvedToday] = await Promise.all([
            prisma.alert.count({
                where: { priority: 'CRITICAL', isResolved: false }
            }),
            prisma.alert.count({
                where: { priority: 'HIGH', isResolved: false }
            }),
            prisma.alert.count({
                where: { isResolved: false }
            }),
            prisma.alert.count({
                where: {
                    isResolved: true,
                    resolvedAt: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0))
                    }
                }
            })
        ]);
        res.json({
            success: true,
            data: {
                alerts,
                pagination: {
                    current: parseInt(page),
                    total: Math.ceil(totalCount / parseInt(limit)),
                    hasNext: skip + parseInt(limit) < totalCount,
                    totalCount
                },
                statistics: {
                    critical: criticalAlerts,
                    high: highAlerts,
                    unresolved: unresolvedAlerts,
                    resolvedToday
                }
            }
        });
    }
    catch (error) {
        console.error("Error fetching alerts:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch alerts"
        });
    }
});
/**
 * GET /api/admin/alerts/:id - Get specific alert details
 */
router.get("/:id", adminOnlyRoute, async (req, res) => {
    try {
        const alertId = req.params.id;
        const alert = await prisma.alert.findUnique({
            where: { id: alertId },
            include: {
                resolvedBy: {
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
                }
            }
        });
        if (!alert) {
            return res.status(404).json({
                success: false,
                message: "Alert not found"
            });
        }
        res.json({
            success: true,
            data: alert
        });
    }
    catch (error) {
        console.error("Error fetching alert details:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch alert details"
        });
    }
});
/**
 * POST /api/admin/alerts - Create new alert
 */
router.post("/", adminOnlyRoute, async (req, res) => {
    try {
        const { title, message, priority = 'MEDIUM', category = 'SYSTEM', metadata } = req.body;
        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: "Title and message are required"
            });
        }
        const alert = await prisma.alert.create({
            data: {
                title,
                message,
                priority,
                category,
                metadata: metadata || {},
                isResolved: false,
                createdBy: req.user.id
            }
        });
        res.status(201).json({
            success: true,
            message: "Alert created successfully",
            data: alert
        });
    }
    catch (error) {
        console.error("Error creating alert:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create alert"
        });
    }
});
/**
 * PATCH /api/admin/alerts/:id/resolve - Resolve alert
 */
router.patch("/:id/resolve", adminOnlyRoute, async (req, res) => {
    try {
        const alertId = req.params.id;
        const { resolution } = req.body;
        const alert = await prisma.alert.findUnique({
            where: { id: alertId }
        });
        if (!alert) {
            return res.status(404).json({
                success: false,
                message: "Alert not found"
            });
        }
        if (alert.isResolved) {
            return res.status(400).json({
                success: false,
                message: "Alert is already resolved"
            });
        }
        const updatedAlert = await prisma.alert.update({
            where: { id: alertId },
            data: {
                isResolved: true,
                resolvedAt: new Date(),
                resolvedById: req.user.id,
                resolution: resolution || 'Resolved by admin'
            },
            include: {
                resolvedBy: {
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
        });
        res.json({
            success: true,
            message: "Alert resolved successfully",
            data: updatedAlert
        });
    }
    catch (error) {
        console.error("Error resolving alert:", error);
        res.status(500).json({
            success: false,
            message: "Failed to resolve alert"
        });
    }
});
/**
 * PATCH /api/admin/alerts/:id/reopen - Reopen resolved alert
 */
router.patch("/:id/reopen", adminOnlyRoute, async (req, res) => {
    try {
        const alertId = req.params.id;
        const alert = await prisma.alert.findUnique({
            where: { id: alertId }
        });
        if (!alert) {
            return res.status(404).json({
                success: false,
                message: "Alert not found"
            });
        }
        if (!alert.isResolved) {
            return res.status(400).json({
                success: false,
                message: "Alert is not resolved"
            });
        }
        const updatedAlert = await prisma.alert.update({
            where: { id: alertId },
            data: {
                isResolved: false,
                resolvedAt: null,
                resolvedById: null,
                resolution: null
            }
        });
        res.json({
            success: true,
            message: "Alert reopened successfully",
            data: updatedAlert
        });
    }
    catch (error) {
        console.error("Error reopening alert:", error);
        res.status(500).json({
            success: false,
            message: "Failed to reopen alert"
        });
    }
});
/**
 * DELETE /api/admin/alerts/:id - Delete alert
 */
router.delete("/:id", adminOnlyRoute, async (req, res) => {
    try {
        const alertId = req.params.id;
        const alert = await prisma.alert.findUnique({
            where: { id: alertId }
        });
        if (!alert) {
            return res.status(404).json({
                success: false,
                message: "Alert not found"
            });
        }
        await prisma.alert.delete({
            where: { id: alertId }
        });
        res.json({
            success: true,
            message: "Alert deleted successfully"
        });
    }
    catch (error) {
        console.error("Error deleting alert:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete alert"
        });
    }
});
/**
 * PATCH /api/admin/alerts/:id/priority - Update alert priority
 */
router.patch("/:id/priority", adminOnlyRoute, async (req, res) => {
    try {
        const alertId = req.params.id;
        const { priority } = req.body;
        if (!priority || !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) {
            return res.status(400).json({
                success: false,
                message: "Valid priority is required (LOW, MEDIUM, HIGH, CRITICAL)"
            });
        }
        const alert = await prisma.alert.findUnique({
            where: { id: alertId }
        });
        if (!alert) {
            return res.status(404).json({
                success: false,
                message: "Alert not found"
            });
        }
        const updatedAlert = await prisma.alert.update({
            where: { id: alertId },
            data: { priority }
        });
        res.json({
            success: true,
            message: "Alert priority updated successfully",
            data: updatedAlert
        });
    }
    catch (error) {
        console.error("Error updating alert priority:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update alert priority"
        });
    }
});
export default router;
