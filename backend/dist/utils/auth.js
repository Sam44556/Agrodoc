import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    emailAndPassword: {
        enabled: true,
        requireEmailVerification: false, // Disabled for testing
        // Email verification and password reset disabled for now
    },
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
    },
    trustedOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],
    user: {
        additionalFields: {
            phone: {
                type: "string",
                required: false,
                input: true,
            },
            location: {
                type: "string",
                required: false,
                input: true,
            },
            role: {
                type: "string",
                required: false,
                input: true,
            },
        },
    },
    session: {
        expiresIn: 60 * 60 * 24 * 7, // 7 days
        updateAge: 60 * 60 * 24, // 1 day
        includeAdditionalFields: true, // This includes custom user fields in session
    },
    plugins: [],
});
