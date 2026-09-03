import Settings from '../models/Settings.js';
import ApiResponse from '../utils/ApiResponse.js';

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
    const { websiteStatus } = req.body;
    
    if (websiteStatus && !['LIVE', 'UNDER_CONSTRUCTION'].includes(websiteStatus)) {
      return ApiResponse.badRequest(res, 'Invalid website status');
    }

    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ websiteStatus });
    } else {
      if (websiteStatus) {
        settings.websiteStatus = websiteStatus;
      }
      await settings.save();
    }

    return ApiResponse.success(res, settings, 'Settings updated successfully');
  } catch (error) {
    next(error);
  }
};
