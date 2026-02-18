import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { prisma } from "./prisma";

// Define the structure of a Socket.IO user (extends the default Socket type)
interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

// Track which users are online and their socket IDs
const onlineUsers = new Map<string, string>(); // userId -> socketId

/**
 * HELPER FUNCTION: Find or create a conversation between two users
 * 
 * @param userId1 - First user's ID
 * @param userId2 - Second user's ID
 * @returns The conversation ID
 * 
 * EXPLANATION:
 * When User A wants to message User B, we need a "conversation" to store their messages.
 * This function checks if they already have a conversation. If not, it creates one.
 * 
 * Think of it like: When you text a friend for the first time, your phone creates
 * a new conversation thread automatically.
 */
async function findOrCreateConversation(userId1: string, userId2: string): Promise<string> {
  // First, try to find an existing conversation between these two users
  const existingConversation = await prisma.conversation.findFirst({
    where: {
      // A conversation where BOTH users are participants
      AND: [
        {
          participants: {
            some: { userId: userId1 }
          }
        },
        {
          participants: {
            some: { userId: userId2 }
          }
        }
      ],
      // Only look at 1-on-1 conversations (exactly 2 participants)
      participants: {
        every: {
          userId: { in: [userId1, userId2] }
        }
      }
    },
    include: {
      participants: true
    }
  });

  // If we found a conversation, check it has exactly 2 participants (not a group chat)
  if (existingConversation && existingConversation.participants.length === 2) {
    console.log(`📋 Found existing conversation: ${existingConversation.id}`);
    return existingConversation.id;
  }

  // No conversation exists, so create a new one
  console.log(`🆕 Creating new conversation between ${userId1} and ${userId2}`);
  
  const newConversation = await prisma.conversation.create({
    data: {
      participants: {
        create: [
          { userId: userId1 },
          { userId: userId2 }
        ]
      }
    }
  });

  console.log(`✅ Created conversation: ${newConversation.id}`);
  return newConversation.id;
}

/**
 * Initialize Socket.IO server
 * 
 * @param httpServer - The HTTP server instance from Express
 * @returns The configured Socket.IO server instance
 * 
 * EXPLANATION:
 * This function sets up real-time communication between your backend and frontend.
 * It's like creating a "two-way radio" where both sides can talk and listen anytime.
 */
export function initializeSocket(httpServer: HTTPServer): SocketIOServer {
  
  // Create a new Socket.IO server attached to your HTTP server
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // MIDDLEWARE: Authenticate users before they can connect
  // This runs BEFORE a user can establish a WebSocket connection
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      // Extract the userId from the connection handshake (sent from frontend)
      const userId = socket.handshake.auth.userId;
      
      if (!userId) {
        return next(new Error("Authentication error: No user ID provided"));
      }

      // Verify the user exists in the database
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true },
      });

      if (!user) {
        return next(new Error("Authentication error: User not found"));
      }

      // Attach user info to the socket so we can use it later
      socket.userId = user.id;
      socket.userRole = user.role;

      next(); // Allow the connection
    } catch (error) {
      next(new Error("Authentication failed"));
    }
  });

  // EVENT: When a user connects to Socket.IO
  io.on("connection", (socket: AuthenticatedSocket) => {
    console.log(`✅ User connected: ${socket.userId} (Socket ID: ${socket.id})`);

    // Store the user as "online"
    if (socket.userId) {
      onlineUsers.set(socket.userId, socket.id);
      
      // Notify all connected clients about the new online user
      io.emit("user_online", { userId: socket.userId });
    }

    // EVENT: User wants to start a conversation with another user
    socket.on("start_conversation", async (data: { recipientId: string }) => {
      try {
        console.log(`🔍 User ${socket.userId} wants to chat with ${data.recipientId}`);

        // Validate the recipient exists
        const recipient = await prisma.user.findUnique({
          where: { id: data.recipientId },
          select: { id: true, name: true, image: true, role: true }
        });

        if (!recipient) {
          socket.emit("error", { message: "User not found" });
          return;
        }

        // Find or create the conversation
        const conversationId = await findOrCreateConversation(socket.userId!, data.recipientId);

        // Fetch the full conversation with participants and recent messages
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
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
              orderBy: { createdAt: 'desc' },
              take: 50, // Get last 50 messages
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
          }
        });

        // Join the conversation room automatically
        socket.join(conversationId);

        // Send the conversation details back to the user
        socket.emit("conversation_ready", {
          conversation: {
            id: conversation?.id,
            participants: conversation?.participants.map(p => p.user),
            messages: conversation?.messages.reverse() || [] // Reverse to show oldest first
          }
        });

        console.log(`✅ Conversation ${conversationId} ready for user ${socket.userId}`);
      } catch (error) {
        console.error("Error starting conversation:", error);
        socket.emit("error", { message: "Failed to start conversation" });
      }
    });

    // EVENT: User joins a specific conversation room
    socket.on("join_conversation", async (conversationId: string) => {
      console.log(`📥 User ${socket.userId} joining conversation: ${conversationId}`);
      
      // Verify the user is part of this conversation
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          participants: {
            some: { userId: socket.userId },
          },
        },
      });

      if (!conversation) {
        socket.emit("error", { message: "You are not part of this conversation" });
        return;
      }

      // Join the Socket.IO "room" for this conversation
      // Rooms allow us to send messages to specific groups of users
      socket.join(conversationId);
      console.log(`✅ User ${socket.userId} joined room: ${conversationId}`);
    });

    // EVENT: User leaves a conversation room
    socket.on("leave_conversation", (conversationId: string) => {
      socket.leave(conversationId);
      console.log(`👋 User ${socket.userId} left room: ${conversationId}`);
    });

    // EVENT: User sends a message (UPDATED to support creating conversations on-the-fly)
    socket.on("send_message", async (data: {
      conversationId?: string; // Optional now - can send without existing conversation
      recipientId?: string;    // NEW: If no conversationId, we'll create one
      content: string;
    }) => {
      try {
        let conversationId = data.conversationId;

        // If no conversationId provided, create a new conversation
        if (!conversationId && data.recipientId) {
          console.log(`🆕 Creating conversation for message from ${socket.userId} to ${data.recipientId}`);
          conversationId = await findOrCreateConversation(socket.userId!, data.recipientId);
          
          // Join the new conversation room
          socket.join(conversationId);
        }

        if (!conversationId) {
          socket.emit("error", { message: "No conversation ID or recipient ID provided" });
          return;
        }

        console.log(`💬 Message from ${socket.userId} in conversation ${conversationId}`);
        console.log(`📝 Message content:`, data.content);

        // Verify user is part of the conversation
        const conversation = await prisma.conversation.findFirst({
          where: {
            id: conversationId,
            participants: {
              some: { userId: socket.userId }
            }
          }
        });

        if (!conversation) {
          console.error(`❌ User ${socket.userId} not part of conversation ${conversationId}`);
          socket.emit("error", { message: "You are not part of this conversation" });
          return;
        }

        // Save the message to the database
        const message = await prisma.message.create({
          data: {
            conversationId: conversationId,
            senderId: socket.userId!,
            content: data.content,
          },
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                image: true,
                role: true,
              },
            },
          },
        });

        // Update the conversation's last message timestamp
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });

        // Send the message to everyone in the conversation room (including sender)
        io.to(conversationId).emit("new_message", message);

        console.log(`✅ Message sent to room: ${conversationId}`);
      } catch (error) {
        console.error("❌ Error sending message (full error):", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // EVENT: User is typing indicator
    socket.on("typing", (data: { conversationId: string }) => {
      // Broadcast to everyone in the room EXCEPT the sender
      socket.to(data.conversationId).emit("user_typing", {
        userId: socket.userId,
        conversationId: data.conversationId,
      });
    });

    // EVENT: User stopped typing
    socket.on("stop_typing", (data: { conversationId: string }) => {
      socket.to(data.conversationId).emit("user_stopped_typing", {
        userId: socket.userId,
        conversationId: data.conversationId,
      });
    });

    // EVENT: Mark messages as read
    socket.on("mark_as_read", async (data: { conversationId: string }) => {
      try {
        // Update all unread messages in this conversation
        await prisma.message.updateMany({
          where: {
            conversationId: data.conversationId,
            senderId: { not: socket.userId },
            isRead: false,
          },
          data: { isRead: true },
        });

        // Notify others in the conversation
        socket.to(data.conversationId).emit("messages_read", {
          conversationId: data.conversationId,
          userId: socket.userId,
        });
      } catch (error) {
        console.error("Error marking messages as read:", error);
      }
    });

    // EVENT: User disconnects
    socket.on("disconnect", () => {
      console.log(`❌ User disconnected: ${socket.userId} (Socket ID: ${socket.id})`);
      
      // Remove from online users
      if (socket.userId) {
        onlineUsers.delete(socket.userId);
        
        // Notify all clients that this user is now offline
        io.emit("user_offline", { userId: socket.userId });
      }
    });
  });

  console.log("🔌 Socket.IO server initialized");
  return io;
}

/**
 * Get all currently online user IDs
 */
export function getOnlineUsers(): string[] {
  return Array.from(onlineUsers.keys());
}

/**
 * Check if a specific user is online
 */
export function isUserOnline(userId: string): boolean {
  return onlineUsers.has(userId);
}