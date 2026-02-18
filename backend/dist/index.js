import express from "express";
import cors from "cors";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { auth } from "./utils/auth";
import farmerListingsRoutes from "./routes/farmer/listings/route";
import farmerProfileRoutes from "./routes/farmer/profile/route";
import farmerWeatherRoutes from "./routes/farmer/weather/route";
import farmerDashboardRoutes from "./routes/farmer/dashboard/route";
import farmerSettingsRoutes from "./routes/farmer/settings/route";
import farmerCropsRoutes from "./routes/farmer/crops/route";
import farmerMarketRoutes from "./routes/farmer/market/route";
import farmerChatRoutes from "./routes/farmer/chat/route";
import buyerDashboardRoutes from "./routes/buyer/dashboard/route";
import buyerProfileRoutes from "./routes/buyer/profile/route";
import buyerBrowseRoutes from "./routes/buyer/browse/route";
import buyerFavoritesRoutes from "./routes/buyer/favorites/route";
import expertDashboardRoutes from "./routes/expert/dashboard/route";
import expertProfileRoutes from "./routes/expert/profile/route";
import expertArticlesRoutes from "./routes/expert/articles/route";
import adminAnalyticsRoutes from "./routes/admin/analytics/route";
import adminUsersRoutes from "./routes/admin/users/route";
import adminMarketRoutes from "./routes/admin/market/route";
import adminProfileRoutes from "./routes/admin/profile/route";
import adminAlertsRoutes from "./routes/admin/alerts/route";
import authUtilsRoutes from "./routes/auth-utils/route";
const app = express();
const PORT = 5000;
// CORS configuration for frontend
app.use(cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"], // Your Next.js frontend URL
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true, // Allow cookies/sessions
}));
// Parse JSON bodies
app.use(express.json());
// API Routes
app.use("/api/farmer/listings", farmerListingsRoutes);
app.use("/api/farmer/profile", farmerProfileRoutes);
app.use("/api/farmer/weather", farmerWeatherRoutes);
app.use("/api/farmer/dashboard", farmerDashboardRoutes);
app.use("/api/farmer/settings", farmerSettingsRoutes);
app.use("/api/farmer/crops", farmerCropsRoutes);
app.use("/api/farmer/market", farmerMarketRoutes);
app.use("/api/farmer/chat", farmerChatRoutes);
// Buyer routes
app.use("/api/buyer/dashboard", buyerDashboardRoutes);
app.use("/api/buyer/profile", buyerProfileRoutes);
app.use("/api/buyer/browse", buyerBrowseRoutes);
app.use("/api/buyer/favorites", buyerFavoritesRoutes);
// Expert routes
app.use("/api/expert/dashboard", expertDashboardRoutes);
app.use("/api/expert/profile", expertProfileRoutes);
app.use("/api/expert/articles", expertArticlesRoutes);
// Admin routes
app.use("/api/admin/analytics", adminAnalyticsRoutes);
app.use("/api/admin/users", adminUsersRoutes);
app.use("/api/admin/market", adminMarketRoutes);
app.use("/api/admin/profile", adminProfileRoutes);
app.use("/api/admin/alerts", adminAlertsRoutes);
// Auth utilities
app.use("/api/auth-utils", authUtilsRoutes);
// Add error logging middleware for Better Auth
app.use("/api/auth/", (req, res, next) => {
    console.log(`🔐 Auth request: ${req.method} ${req.path}`);
    console.log('📝 Request body:', req.body);
    next();
}, async (req, res, next) => {
    const authHandler = toNodeHandler(auth);
    try {
        await authHandler(req, res);
    }
    catch (error) {
        console.error('❌ Auth error:', error);
        // Handle Prisma unique constraint errors
        if (error.code === 'P2002') {
            const field = error.meta?.target?.[0];
            let message = 'This account already exists';
            if (field === 'phone') {
                message = 'This phone number is already registered. Please use a different phone number or login to your existing account.';
            }
            else if (field === 'email') {
                message = 'This email is already registered. Please login or use a different email.';
            }
            return res.status(400).json({
                error: message,
                field: field
            });
        }
        // Pass other errors to default error handler
        next(error);
    }
});
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({
        error: "Internal server error",
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});
// Test endpoint
app.get("/", (req, res) => {
    res.send("AgroLink Backend Server 🌱");
});
// Protected endpoint example
app.get("/api/me", async (req, res) => {
    try {
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        });
        if (!session) {
            return res.status(401).json({ error: "Not authenticated" });
        }
        return res.json({ user: session.user, session: session.session });
    }
    catch (error) {
        console.error('❌ /api/me error:', error);
        return res.status(500).json({ error: "Server error" });
    }
});
app.listen(PORT, () => {
    console.log(`🚀 AgroLink Backend running on http://localhost:${PORT}`);
    console.log(`🔐 Auth endpoints available at http://localhost:${PORT}/api/auth/*`);
});
