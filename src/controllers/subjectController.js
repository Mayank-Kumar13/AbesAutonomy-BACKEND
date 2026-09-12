import Subject from '../models/Subject.js';
import ApiResponse from '../utils/ApiResponse.js';

/**
 * GET /api/subjects
 * Get active subjects, optionally filtered by year and group.
 */
export const getSubjects = async (req, res, next) => {
  try {
    const { year, group, all } = req.query;
    const filter = {};

    // Only admins can see inactive subjects by passing all=true
    if (!all || req.user?.role !== 'admin') {
      filter.isActive = true;
    }

    if (year) {
      filter.year = parseInt(year, 10);
    }
    
    // Group filter: e.g., if group=electrical, we might also want to fetch common subjects if the UI expects it,
    // but the frontend can handle multiple requests or we can allow an array.
    // Let's stick to exact match or 'common' if required.
    if (group) {
      filter.group = { $in: [group.toLowerCase(), 'common'] };
    }

    const subjects = await Subject.find(filter).sort({ displayOrder: 1, name: 1 });
    return ApiResponse.success(res, subjects);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/subjects/all
 * Get all subjects (admin only).
 */
export const getAllSubjects = async (req, res, next) => {
  try {
    const subjects = await Subject.find({}).sort({ year: 1, displayOrder: 1, name: 1 });
    return ApiResponse.success(res, subjects);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/subjects
 * Create a new subject (admin only).
 */
export const createSubject = async (req, res, next) => {
  try {
    const { name, description, year, group, icon, displayOrder, isActive } = req.body;

    const subject = new Subject({
      name,
      description,
      year,
      group,
      icon,
      displayOrder,
      isActive
    });

    await subject.save();
    return ApiResponse.created(res, subject);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/subjects/:id
 * Update an existing subject (admin only).
 */
export const updateSubject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const subject = await Subject.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found' });
    }

    return ApiResponse.success(res, subject);
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/subjects/:id
 * Delete a subject completely (admin only).
 */
export const deleteSubject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const subject = await Subject.findByIdAndDelete(id);

    if (!subject) {
      return res.status(404).json({ success: false, message: 'Subject not found' });
    }

    return ApiResponse.success(res, { message: 'Subject deleted successfully' });
  } catch (error) {
    next(error);
  }
};
