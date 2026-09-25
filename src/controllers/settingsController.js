import Settings from '../models/Settings.js';
import ApiResponse from '../utils/ApiResponse.js';
import { logAdminActivity } from '../utils/logger.js';
import { broadcastAnnouncement } from '../utils/socketManager.js';

/**
 * GET /api/settings
 * Fetch global application settings (e.g. websiteStatus)
 */
export const getSettings = async (req, res, next) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ websiteStatus: 'UNDER_CONSTRUCTION' });
    }
    return ApiResponse.success(res, settings);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/settings
 * Update global application settings
 */
export const updateSettings = async (req, res, next) => {
  try {
    const { websiteStatus, announcement } = req.body;
    
    if (websiteStatus && !['LIVE', 'UNDER_CONSTRUCTION'].includes(websiteStatus)) {
      return ApiResponse.badRequest(res, 'Invalid website status');
    }

    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ websiteStatus, announcement });
    } else {
      if (websiteStatus) {
        settings.websiteStatus = websiteStatus;
      }
      if (announcement !== undefined) {
        settings.announcement = announcement;
      }
      await settings.save();
    }

    if (announcement !== undefined) {
      broadcastAnnouncement(settings.announcement);
    }

    await logAdminActivity(req, 'CHANGE_STATUS', `Changed website status to ${settings.websiteStatus}`);
    return ApiResponse.success(res, settings, 'Settings updated successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/settings/react
 * Increment the reaction count for the current announcement
 */
export const reactToAnnouncement = async (req, res, next) => {
  try {
    let settings = await Settings.findOne();
    if (settings && settings.announcement && settings.announcement.active) {
      settings.announcement.reactions = (settings.announcement.reactions || 0) + 1;
      await settings.save();
      // Optional: Broadcast the new reaction count via sockets
      broadcastAnnouncement(settings.announcement);
    }
    return ApiResponse.success(res, settings?.announcement?.reactions || 0, 'Reaction added');
  } catch (error) {
    next(error);
  }
};
