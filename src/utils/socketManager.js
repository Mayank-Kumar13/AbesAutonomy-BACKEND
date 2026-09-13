import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import User from '../models/User.js';

let io;
// Store active staff members: socketId -> { userId, name, role, location, pdfId, pdfTitle, updatedAt }
const activeStaff = new Map();

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: env.FRONTEND_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    socket.on('register_staff', async (data) => {
      try {
        if (!data.token) return;
        
        const decoded = jwt.verify(data.token, env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (user && (user.role === 'admin' || user.role === 'coordinator')) {
          activeStaff.set(socket.id, {
            userId: user._id.toString(),
            name: user.name,
            role: user.role,
            location: data.location || '/',
            pdfId: data.pdfId || null,
            pdfTitle: data.pdfTitle || null,
            updatedAt: new Date().toISOString(),
          });
          broadcastActiveStaff();
        }
      } catch (err) {
        // Silent catch for invalid tokens
      }
    });

    socket.on('update_location', (data) => {
      const staff = activeStaff.get(socket.id);
      if (staff) {
        staff.location = data.location;
        staff.pdfId = data.pdfId || null;
        staff.pdfTitle = data.pdfTitle || null;
        staff.updatedAt = new Date().toISOString();
        activeStaff.set(socket.id, staff);
        broadcastActiveStaff();
      }
    });

    socket.on('disconnect', () => {
      if (activeStaff.has(socket.id)) {
        activeStaff.delete(socket.id);
        broadcastActiveStaff();
      }
    });
  });
};

const broadcastActiveStaff = () => {
  if (!io) return;
  const staffList = Array.from(activeStaff.values());
  io.emit('active_staff_update', staffList);
};

export const getActiveStaff = () => {
  return Array.from(activeStaff.values());
};
