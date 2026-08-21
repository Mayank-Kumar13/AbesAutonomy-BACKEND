import Note from '../models/Note.js';

// Mapping between frontend requested subjects and possible database values
const SUBJECT_ALIASES = {
  'AI': ['AI', 'ARTIFICIAL INTELLIGENCE', 'ARTIFICIAL-INTELLIGENCE'],
  'MATHS': ['MATHS', 'MATHEMATICS', 'MATH'],
  'PHYSICS': ['PHYSICS', 'PHY', 'ENGINEERING PHYSICS'],
  'ELECTRICAL': ['ELECTRICAL', 'BEE', 'BASIC ELECTRICAL'],
  'ELECTRONICS': ['ELECTRONICS', 'BCE', 'BASIC ELECTRONICS'],
  'DSA': ['DSA', 'DATA STRUCTURES', 'DATA STRUCTURES AND ALGORITHMS'],
  'EVS': ['EVS', 'ENVIRONMENTAL STUDIES'],
  'SOFT SKILL': ['SOFT SKILL', 'SOFT SKILLS'],
  'DT': ['DT', 'DIGITAL TECHNIQUES'],
  'MECHANICS': ['MECHANICS', 'ENGINEERING MECHANICS']
};

/**
 * Build a MongoDB filter object from query parameters.
 */
export const buildNoteFilter = (query) => {
  const filter = { isPublished: true };

  // Allow "common" branch subjects to be visible regardless of which specific branch the student selects
  if (query.branch) {
    const branchVal = query.branch.toLowerCase();
    filter.branch = { $in: [branchVal, 'common'] };
  }
  
  if (query.year) filter.year = parseInt(query.year, 10);
  if (query.semester) filter.semester = parseInt(query.semester, 10);
  if (query.resourceType) filter.resourceType = query.resourceType.toLowerCase();
  
  // Map frontend subject request to all possible variations in the DB
  if (query.subject) {
    const requestedSubject = query.subject.toUpperCase();
    const aliases = SUBJECT_ALIASES[requestedSubject] || [requestedSubject];
    filter.subject = { $in: aliases };
  }
  
  if (query.unit) filter.unit = parseInt(query.unit, 10);

  return filter;
};

/**
 * Get paginated notes with filters.
 */
export const getFilteredNotes = async (query) => {
  const filter = buildNoteFilter(query);
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  // Sort: default by createdAt descending
  const sortField = query.sort || '-createdAt';
  const sortObj = {};
  if (sortField.startsWith('-')) {
    sortObj[sortField.slice(1)] = -1;
  } else {
    sortObj[sortField] = 1;
  }

  const [notes, total] = await Promise.all([
    Note.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .populate('uploadedBy', 'name email')
      .lean(),
    Note.countDocuments(filter),
  ]);

  return { notes, total, page, limit };
};

/**
 * Full-text search notes.
 */
export const searchNotes = async (query) => {
  const searchQuery = query.q;
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const filter = {
    $text: { $search: searchQuery },
    isPublished: true,
  };

  const [notes, total] = await Promise.all([
    Note.find(filter, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .skip(skip)
      .limit(limit)
      .lean(),
    Note.countDocuments(filter),
  ]);

  return { notes, total, page, limit };
};

/**
 * Get distinct subjects, optionally filtered.
 */
export const getDistinctSubjects = async (filters = {}) => {
  const match = { isPublished: true };
  if (filters.branch) match.branch = filters.branch.toLowerCase();
  if (filters.year) match.year = parseInt(filters.year, 10);
  if (filters.resourceType) match.resourceType = filters.resourceType.toLowerCase();

  const subjects = await Note.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$subject',
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return subjects.map((s) => ({ subject: s._id, count: s.count }));
};

/**
 * Get distinct branches.
 */
export const getDistinctBranches = async () => {
  const branches = await Note.distinct('branch', { isPublished: true });
  return branches;
};

/**
 * Get note statistics.
 */
export const getNoteStats = async () => {
  const [totalNotes, publishedNotes, totalViews, totalDownloads, byResourceType, byBranch] =
    await Promise.all([
      Note.countDocuments(),
      Note.countDocuments({ isPublished: true }),
      Note.aggregate([
        { $group: { _id: null, total: { $sum: '$viewCount' } } },
      ]),
      Note.aggregate([
        { $group: { _id: null, total: { $sum: '$downloadCount' } } },
      ]),
      Note.aggregate([
        { $group: { _id: '$resourceType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Note.aggregate([
        { $group: { _id: '$branch', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

  return {
    totalNotes,
    publishedNotes,
    totalViews: totalViews[0]?.total || 0,
    totalDownloads: totalDownloads[0]?.total || 0,
    byResourceType: byResourceType.map((r) => ({ type: r._id, count: r.count })),
    byBranch: byBranch.map((b) => ({ branch: b._id, count: b.count })),
  };
};

export default {
  buildNoteFilter,
  getFilteredNotes,
  searchNotes,
  getDistinctSubjects,
  getDistinctBranches,
  getNoteStats,
};
