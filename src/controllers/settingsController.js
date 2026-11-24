import Settings from '../models/Settings.js';
import ApiResponse from '../utils/ApiResponse.js';
import { logAdminActivity } from '../utils/logger.js';
import { broadcastAnnouncement } from '../utils/socketManager.js';

let cachedSettings = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 15000; // 15s cache to handle massive concurrent traffic spikes effortlessly

export const clearSettingsCache = () => {
  cachedSettings = null;
  cacheExpiry = 0;
};

/**
 * GET /api/settings
 * Fetch global application settings (e.g. websiteStatus)
 */
export const getSettings = async (req, res, next) => {
  try {
    const now = Date.now();
    if (cachedSettings && now < cacheExpiry) {
      return ApiResponse.success(res, cachedSettings);
    }

    let settings = await Settings.findOne().lean();
    if (!settings) {
      settings = await Settings.create({ websiteStatus: 'LIVE' });
      settings = settings.toObject ? settings.toObject() : settings;
    }
    cachedSettings = settings;
    cacheExpiry = now + CACHE_TTL_MS;
    return ApiResponse.success(res, settings);
  } catch (error) {
    if (cachedSettings) {
      return ApiResponse.success(res, cachedSettings);
    }
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

    clearSettingsCache();

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
      clearSettingsCache();
      // Optional: Broadcast the new reaction count via sockets
      broadcastAnnouncement(settings.announcement);
    }
    return ApiResponse.success(res, settings?.announcement?.reactions || 0, 'Reaction added');
  } catch (error) {
    next(error);
  }
};
