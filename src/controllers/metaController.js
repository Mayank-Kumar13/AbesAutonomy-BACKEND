import ApiResponse from '../utils/ApiResponse.js';
import {
  getDistinctSubjects,
  getDistinctBranches,
  getNoteStats,
} from '../services/noteService.js';

/**
 * GET /api/meta/subjects
 * Get distinct subjects, optionally filtered by branch/year/resourceType.
 */
export const getSubjects = async (req, res, next) => {
  try {
    const subjects = await getDistinctSubjects(req.query);
    return ApiResponse.success(res, subjects);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/meta/branches
 * Get distinct branches.
 */
export const getBranches = async (req, res, next) => {
  try {
    const branches = await getDistinctBranches();
    return ApiResponse.success(res, branches);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/meta/stats
 * Get platform statistics (admin only).
 */
export const getStats = async (req, res, next) => {
  try {
    const stats = await getNoteStats();
    return ApiResponse.success(res, stats);
  } catch (error) {
    next(error);
  }
};
