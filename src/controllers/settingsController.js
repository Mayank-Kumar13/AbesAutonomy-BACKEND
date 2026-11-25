import Settings from '../models/Settings.js';
import ApiResponse from '../utils/ApiResponse.js';
import { logAdminActivity } from '../utils/logger.js';
import { broadcastAnnouncement } from '../utils/socketManager.js';

let cachedSettings = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 15000; // 15s cache to handle massive concurrent traffic spikes effortlessly

const DEFAULT_ADS_SETTINGS = {
  enabled: true,
  clientId: 'ca-pub-9991688552602855',
  leftSlotId: '',
  rightSlotId: '',
  mobileSlotId: '',
  hideForPremium: true,
  showSetupPlaceholders: false,
};

const cleanSlotId = (value) => String(value ?? '').replace(/\s+/g, '').slice(0, 40);

export const normalizeAdsSettings = (rawAds = {}) => ({
  enabled: rawAds?.enabled !== undefined ? Boolean(rawAds.enabled) : DEFAULT_ADS_SETTINGS.enabled,
  clientId: cleanSlotId(rawAds?.clientId) || DEFAULT_ADS_SETTINGS.clientId,
  leftSlotId: cleanSlotId(rawAds?.leftSlotId),
  rightSlotId: cleanSlotId(rawAds?.rightSlotId),
  mobileSlotId: cleanSlotId(rawAds?.mobileSlotId),
  hideForPremium:
    rawAds?.hideForPremium !== undefined ? Boolean(rawAds.hideForPremium) : DEFAULT_ADS_SETTINGS.hideForPremium,
  showSetupPlaceholders:
    rawAds?.showSetupPlaceholders !== undefined
      ? Boolean(rawAds.showSetupPlaceholders)
      : DEFAULT_ADS_SETTINGS.showSetupPlaceholders,
});

export const clearSettingsCache = () => {
  cachedSettings = null;
  cacheExpiry = 0;
};

/**
 * GET /api/settings
 * Fetch global application settings (e.g. websiteStatus, announcement, ads)
 */
export const getSettings = async (req, res, next) => {
  try {
    const now = Date.now();
    if (cachedSettings && now < cacheExpiry) {
      return ApiResponse.success(res, cachedSettings);
    }

    let settings = await Settings.findOne().lean();
    if (!settings) {
      settings = await Settings.create({ websiteStatus: 'LIVE', ads: DEFAULT_ADS_SETTINGS });
      settings = settings.toObject ? settings.toObject() : settings;
    }
    const normalized = {
      ...settings,
      ads: normalizeAdsSettings(settings.ads),
    };
    cachedSettings = normalized;
    cacheExpiry = now + CACHE_TTL_MS;
    return ApiResponse.success(res, normalized);
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
    const { websiteStatus, announcement, ads } = req.body;
    
    if (websiteStatus && !['LIVE', 'UNDER_CONSTRUCTION'].includes(websiteStatus)) {
      return ApiResponse.badRequest(res, 'Invalid website status');
    }

    if (ads !== undefined && (typeof ads !== 'object' || ads === null || Array.isArray(ads))) {
      return ApiResponse.badRequest(res, 'Invalid ads settings payload');
    }

    const sanitizedAds = ads !== undefined ? normalizeAdsSettings(ads) : undefined;
    if (sanitizedAds) {
      if (!/^ca-pub-\d{10,20}$/.test(sanitizedAds.clientId)) {
        return ApiResponse.badRequest(res, 'AdSense Client ID must match format ca-pub-XXXXXXXXXXXXXXXX');
      }
      for (const [key, val] of Object.entries({
        leftSlotId: sanitizedAds.leftSlotId,
        rightSlotId: sanitizedAds.rightSlotId,
        mobileSlotId: sanitizedAds.mobileSlotId,
      })) {
        if (val && !/^\d{6,20}$/.test(val)) {
          return ApiResponse.badRequest(res, `Invalid numeric AdSense ${key}`);
        }
      }
    }

    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({
        websiteStatus: websiteStatus || 'LIVE',
        announcement,
        ads: sanitizedAds || DEFAULT_ADS_SETTINGS,
      });
    } else {
      if (websiteStatus) {
        settings.websiteStatus = websiteStatus;
      }
      if (announcement !== undefined) {
        settings.announcement = announcement;
      }
      if (sanitizedAds !== undefined) {
        settings.ads = sanitizedAds;
      }
      await settings.save();
    }

    clearSettingsCache();

    if (announcement !== undefined) {
      broadcastAnnouncement(settings.announcement);
    }

    const actionDetails = sanitizedAds !== undefined && !websiteStatus && announcement === undefined
      ? `Updated Google AdSense configuration (enabled=${sanitizedAds.enabled})`
      : `Changed website status to ${settings.websiteStatus}`;
    await logAdminActivity(req, 'CHANGE_STATUS', actionDetails);

    const plain = settings.toObject ? settings.toObject() : settings;
    return ApiResponse.success(
      res,
      { ...plain, ads: normalizeAdsSettings(plain.ads) },
      'Settings updated successfully'
    );
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
