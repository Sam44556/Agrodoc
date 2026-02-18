import { Router, Request, Response } from "express";
import { adminOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";

const router = Router();

/**
 * GET /api/admin/alerts - Get system alerts
 */
router.get("/", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const {
      status = 'all',
      severity: severityFilter = 'all',
      alertType = 'all',
      page = 1,
      limit = 20
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const where: any = {};

    if (status !== 'all') {
      where.isResolved = status === 'resolved';
    }

    if (severityFilter !== 'all') {
      where.severity = severityFilter;
    }

    if (alertType !== 'all') {
      where.alertType = alertType;
    }

    const [alerts, totalCount] = await Promise.all([
      prisma.systemAlert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string),
        include: {
          admin: {
            select: {
              id: true,
              email: true,
              name: true
            }
          }
        }
      }),
      prisma.systemAlert.count({ where })
    ]);

    // Get alert statistics
    const [
      criticalAlerts,
      highAlerts,
      unresolvedAlerts,
      resolvedToday
    ] = await Promise.all([
      prisma.systemAlert.count({
        where: { severity: 'CRITICAL', isResolved: false }
      }),
      prisma.systemAlert.count({
        where: { severity: 'HIGH', isResolved: false }
      }),
      prisma.systemAlert.count({
        where: { isResolved: false }
      }),
      prisma.systemAlert.count({
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
          current: parseInt(page as string),
          total: Math.ceil(totalCount / parseInt(limit as string)),
          hasNext: skip + parseInt(limit as string) < totalCount,
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

  } catch (error) {
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
router.get("/:id", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const alertId = req.params.id;

    const alert = await prisma.systemAlert.findUnique({
      where: { id: alertId },
      include: {
        admin: {
          select: {
            id: true,
            email: true,
            name: true
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

  } catch (error) {
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
router.post("/", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      severity = 'MEDIUM',
      alertType = 'system'
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: "Title and description are required"
      });
    }

    const alert = await prisma.systemAlert.create({
      data: {
        title,
        description,
        severity,
        alertType,
        adminId: req.user!.id,
        isResolved: false
      }
    });

    res.status(201).json({
      success: true,
      message: "Alert created successfully",
      data: alert
    });

  } catch (error) {
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
router.patch("/:id/resolve", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const alertId = req.params.id;

    const alert = await prisma.systemAlert.findUnique({
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

    const updatedAlert = await prisma.systemAlert.update({
      where: { id: alertId },
      data: {
        isResolved: true,
        resolvedAt: new Date()
      }
    });

    res.json({
      success: true,
      message: "Alert resolved successfully",
      data: updatedAlert
    });

  } catch (error) {
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
router.patch("/:id/reopen", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const alertId = req.params.id;

    const alert = await prisma.systemAlert.findUnique({
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

    const updatedAlert = await prisma.systemAlert.update({
      where: { id: alertId },
      data: {
        isResolved: false,
        resolvedAt: null
      }
    });

    res.json({
      success: true,
      message: "Alert reopened successfully",
      data: updatedAlert
    });

  } catch (error) {
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
router.delete("/:id", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const alertId = req.params.id;

    const alert = await prisma.systemAlert.findUnique({
      where: { id: alertId }
    });

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Alert not found"
      });
    }

    await prisma.systemAlert.delete({
      where: { id: alertId }
    });

    res.json({
      success: true,
      message: "Alert deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting alert:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete alert"
    });
  }
});

/**
 * PATCH /api/admin/alerts/:id/priority - Update alert severity
 */
router.patch("/:id/priority", adminOnlyRoute, async (req: Request, res: Response) => {
  try {
    const alertId = req.params.id;
    const { priority } = req.body;

    if (!priority || !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) {
      return res.status(400).json({
        success: false,
        message: "Valid priority is required (LOW, MEDIUM, HIGH, CRITICAL)"
      });
    }

    const alert = await prisma.systemAlert.findUnique({
      where: { id: alertId }
    });

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Alert not found"
      });
    }

    const updatedAlert = await prisma.systemAlert.update({
      where: { id: alertId },
      data: { severity: priority }
    });

    res.json({
      success: true,
      message: "Alert priority updated successfully",
      data: updatedAlert
    });

  } catch (error) {
    console.error("Error updating alert priority:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update alert priority"
    });
  }
});

export default router;