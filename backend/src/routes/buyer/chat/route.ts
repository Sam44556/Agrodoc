import { Router, Request, Response } from "express";
import { buyerOnlyRoute } from "../../../middleware/auths";
import { prisma } from "../../../utils/prisma";

const router = Router();

/**
 * GET /api/buyer/chat/conversations - Get buyer conversations
 */
router.get("/conversations", buyerOnlyRoute, async (req: Request, res: Response) => {
  try {
    const buyerId = req.user!.id;

    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            userId: buyerId
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
          take: 50,
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                image: true,
                role: true
              }
            }
          }
        }
      },
      orderBy: { updatedAt: "desc" }
    });

    const formatted = conversations.map((conversation) => {
      return {
        id: conversation.id,
        participants: conversation.participants,
        messages: conversation.messages.reverse(), // oldest first
        updatedAt: conversation.updatedAt
      };
    });

    res.json({
      success: true,
      data: formatted
    });
  } catch (error) {
    console.error("❌ Error fetching buyer conversations:", error);
    res.status(500).json({
      error: "Failed to fetch conversations",
      message: "Could not retrieve conversations"
    });
  }
});

/**
 * GET /api/buyer/chat/conversations/:id/messages - Get messages for a conversation
 */
router.get("/conversations/:id/messages", buyerOnlyRoute, async (req: Request, res: Response) => {
  try {
    const buyerId = req.user!.id;
    const conversationId = req.params.id;

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: { some: { userId: buyerId } }
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
            image: true,
            role: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: messages
    });
  } catch (error) {
    console.error("❌ Error fetching messages:", error);
    res.status(500).json({
      error: "Failed to fetch messages",
      message: "Could not retrieve messages"
    });
  }
});

/**
 * POST /api/buyer/chat/conversations/:id/messages - Send a message
 */
router.post("/conversations/:id/messages", buyerOnlyRoute, async (req: Request, res: Response) => {
  try {
    const buyerId = req.user!.id;
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
        participants: { some: { userId: buyerId } }
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
        senderId: buyerId
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            image: true,
            role: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      data: message
    });
  } catch (error) {
    console.error("❌ Error sending message:", error);
    res.status(500).json({
      error: "Failed to send message",
      message: "Could not send message"
    });
  }
});

export default router;
