import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import User from '../models/User.js';

let io;
// Store active users: socketId -> { userId, name, role, location, pdfId, pdfTitle, updatedAt }
const activeUsers = new Map();

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: env.FRONTEND_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    socket.on('register_user', async (data) => {
      try {
        if (!data.token) return;
        
        const decoded = jwt.verify(data.token, env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (user) {
          activeUsers.set(socket.id, {
            userId: user._id.toString(),
            name: user.name,
            role: user.role,
            location: data.location || '/',
            pdfId: data.pdfId || null,
            pdfTitle: data.pdfTitle || null,
            updatedAt: new Date().toISOString(),
          });
          broadcastActiveUsers();
        }
      } catch (err) {
        // Silent catch for invalid tokens
      }
    });

    socket.on('update_location', (data) => {
      const user = activeUsers.get(socket.id);
      if (user) {
        user.location = data.location;
        user.pdfId = data.pdfId || null;
        user.pdfTitle = data.pdfTitle || null;
        user.updatedAt = new Date().toISOString();
        activeUsers.set(socket.id, user);
        broadcastActiveUsers();
      }
    });

    socket.on('disconnect', () => {
      if (activeUsers.has(socket.id)) {
        activeUsers.delete(socket.id);
        broadcastActiveUsers();
      }
    });
  });
};

const broadcastActiveUsers = () => {
  if (!io) return;
  const userList = Array.from(activeUsers.values());
  io.emit('active_user_update', userList);
};

export const getActiveStaff = () => {
  // Unused typically, but you can change it to getActiveUsers if needed
  return Array.from(activeUsers.values());
};
