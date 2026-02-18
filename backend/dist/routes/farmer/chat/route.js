import { Router } from "express";
import { farmerOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";
const router = Router();
/**
 * GET /api/farmer/chat/conversations - Get farmer conversations
 */
router.get("/conversations", farmerOnlyRoute, async (req, res) => {
    try {
        const farmerId = req.user.id;
        const conversations = await prisma.conversation.findMany({
            where: {
                participants: {
                    some: {
                        userId: farmerId
                    }
                }
            },
            include: {
                participants: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                image: true,
                                role: true
                            }
                        }
                    }
                },
                messages: {
                    orderBy: { createdAt: "desc" },
                    take: 1
                }
            },
            orderBy: { updatedAt: "desc" }
        });
        const formatted = conversations.map((conversation) => {
            const otherParticipant = conversation.participants.find((p) => p.userId !== farmerId);
            const lastMessage = conversation.messages[0];
            return {
                id: conversation.id,
                buyer: otherParticipant?.user
                    ? {
                        id: otherParticipant.user.id,
                        name: otherParticipant.user.name,
                        avatar: otherParticipant.user.image,
                        role: otherParticipant.user.role
                    }
                    : null,
                lastMessage: lastMessage?.content || "",
                lastMessageTime: lastMessage?.createdAt || null,
                unreadCount: 0,
                isOnline: false
            };
        });
        res.json({
            success: true,
            data: formatted
        });
    }
    catch (error) {
        console.error("❌ Error fetching conversations:", error);
        res.status(500).json({
            error: "Failed to fetch conversations",
            message: "Could not retrieve conversations"
        });
    }
});
/**
 * GET /api/farmer/chat/conversations/:id/messages - Get messages for a conversation
 */
router.get("/conversations/:id/messages", farmerOnlyRoute, async (req, res) => {
    try {
        const farmerId = req.user.id;
        const conversationId = req.params.id;
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                participants: { some: { userId: farmerId } }
            }
        });
        if (!conversation) {
            return res.status(404).json({
                error: "Conversation not found",
                message: "You do not have access to this conversation"
            });
        }
        const messages = await prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: "asc" },
            include: {
                sender: {
                    select: {
                        id: true,
                        name: true,
                        image: true
                    }
                }
            }
        });
        res.json({
            success: true,
            data: messages
        });
    }
    catch (error) {
        console.error("❌ Error fetching messages:", error);
        res.status(500).json({
            error: "Failed to fetch messages",
            message: "Could not retrieve messages"
        });
    }
});
/**
 * POST /api/farmer/chat/conversations/:id/messages - Send a message
 */
router.post("/conversations/:id/messages", farmerOnlyRoute, async (req, res) => {
    try {
        const farmerId = req.user.id;
        const conversationId = req.params.id;
        const { content } = req.body;
        if (!content || !content.trim()) {
            return res.status(400).json({
                error: "Message content is required"
            });
        }
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                participants: { some: { userId: farmerId } }
            }
        });
        if (!conversation) {
            return res.status(404).json({
                error: "Conversation not found",
                message: "You do not have access to this conversation"
            });
        }
        const message = await prisma.message.create({
            data: {
                content,
                conversationId,
                senderId: farmerId
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        name: true,
                        image: true
                    }
                }
            }
        });
        res.status(201).json({
            success: true,
            data: message
        });
    }
    catch (error) {
        console.error("❌ Error sending message:", error);
        res.status(500).json({
            error: "Failed to send message",
            message: "Could not send message"
        });
    }
});
export default router;
