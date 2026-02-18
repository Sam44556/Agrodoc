import { Request, Response, NextFunction } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../utils/auth.js";
import { prisma } from "../utils/prisma.js";

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role?: string;
      };
      session?: any;
    }
  }
}

/**
 * Route Protection Middleware
 */
export const protectRoute = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session || !session.user) {
      return res.status(401).json({ 
        error: "Authentication required",
        message: "Please log in to access this resource"
      });
    }

    // Get the user with their role from database to ensure we have the latest data
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });

    if (!user) {
      return res.status(401).json({
        error: "User not found",
        message: "Your user account could not be found"
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name || "",
      role: user.role || "user"
    };
    req.session = session.session;

    console.log("🔐 User authenticated:", { id: req.user.id, email: req.user.email, role: req.user.role });

    next();
  } catch (error) {
    console.error("🔐 Route protection error:", error);
    return res.status(401).json({ 
      error: "Invalid session",
      message: "Your session has expired. Please log in again."
    });
  }
};

/**
 * Authorization Middleware
 */
export const authorizeMiddleware = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: "Authentication required"
      });
    }

    const userRole = (req.user.role || "user").toLowerCase();
    const normalizedAllowedRoles = allowedRoles.map(role => role.toLowerCase());
    console.log(`🔐 Authorization check - User role: ${userRole}, Allowed roles: ${normalizedAllowedRoles.join(", ")}`);
    
    if (!normalizedAllowedRoles.includes(userRole)) {
      console.log(`❌ Access denied for user ${req.user.id} with role ${userRole}`);
      return res.status(403).json({ 
        error: "Access denied",
        message: `Requires role: ${allowedRoles.join(" or ")}`
      });
    }

    console.log(`✅ Access granted for user ${req.user.id} with role ${userRole}`);
    next();
  };
};

/**
 * Role-Specific Routes
 */
export const farmerOnlyRoute = [protectRoute, authorizeMiddleware(['farmer', 'admin'])];
export const buyerOnlyRoute = [protectRoute, authorizeMiddleware(['buyer', 'admin'])];
export const expertOnlyRoute = [protectRoute, authorizeMiddleware(['expert', 'admin'])];
export const adminOnlyRoute = [protectRoute, authorizeMiddleware(['admin'])];