import User from '../models/User.js';
import PdfViewLog from '../models/PdfViewLog.js';
import LoginLog from '../models/LoginLog.js';
import ApiResponse from '../utils/ApiResponse.js';

const getDateRange = (query) => {
  const { range, startDate, endDate } = query;
  let start = new Date();
  let end = new Date();
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  let prevStart = new Date(start);
  let prevEnd = new Date(end);

  if (startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
    const diff = end - start;
    prevStart = new Date(start.getTime() - diff);
    prevEnd = new Date(end.getTime() - diff);
  } else {
    switch (range) {
      case 'today':
        prevStart.setDate(start.getDate() - 1);
        prevEnd.setDate(end.getDate() - 1);
        break;
      case 'yesterday':
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
        prevStart.setDate(start.getDate() - 1);
        prevEnd.setDate(end.getDate() - 1);
        break;
      case '7days':
        start.setDate(start.getDate() - 7);
        prevStart.setDate(start.getDate() - 7);
        prevEnd.setDate(end.getDate() - 7);
        break;
      case '30days':
        start.setDate(start.getDate() - 30);
        prevStart.setDate(start.getDate() - 30);
        prevEnd.setDate(end.getDate() - 30);
        break;
      case 'thisMonth':
        start.setDate(1);
        prevStart.setMonth(start.getMonth() - 1);
        prevStart.setDate(1);
        prevEnd = new Date(start);
        prevEnd.setDate(0);
        break;
      case 'lastMonth':
        start.setMonth(start.getMonth() - 1);
        start.setDate(1);
        end = new Date(start);
        end.setMonth(end.getMonth() + 1);
        end.setDate(0);
        end.setHours(23, 59, 59, 999);
        prevStart.setMonth(start.getMonth() - 1);
        prevStart.setDate(1);
        prevEnd = new Date(start);
        prevEnd.setDate(0);
        prevEnd.setHours(23, 59, 59, 999);
        break;
      case 'thisYear':
        start.setMonth(0, 1);
        prevStart.setFullYear(start.getFullYear() - 1, 0, 1);
        prevEnd.setFullYear(start.getFullYear() - 1, 11, 31);
        break;
      default:
        start.setDate(start.getDate() - 30);
        prevStart.setDate(start.getDate() - 30);
        prevEnd.setDate(end.getDate() - 30);
        break;
    }
  }
  return { start, end, prevStart, prevEnd };
};

export const getAnalyticsOverview = async (req, res, next) => {
  try {
    const { start, end, prevStart, prevEnd } = getDateRange(req.query);

    // Total Users (Lifetime)
    const totalUsers = await User.countDocuments();
    
    // New Users
    const newUsers = await User.countDocuments({ createdAt: { $gte: start, $lte: end } });
    const prevNewUsers = await User.countDocuments({ createdAt: { $gte: prevStart, $lte: prevEnd } });

    // Active Users (from LoginLog or PdfViewLog)
    // We'll use LoginLog for uniqueness of login sessions
    const activeUsersResult = await LoginLog.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: "$userId" } }
    ]);
    const activeUsers = activeUsersResult.length;

    const prevActiveUsersResult = await LoginLog.aggregate([
      { $match: { createdAt: { $gte: prevStart, $lte: prevEnd } } },
      { $group: { _id: "$userId" } }
    ]);
    const prevActiveUsers = prevActiveUsersResult.length;

    // Total Engagement Time (from PdfViewLog)
    const engagementResult = await PdfViewLog.aggregate([
      { $match: { endTime: { $gte: start, $lte: end } } },
      { $group: { _id: null, totalMs: { $sum: "$durationMs" }, count: { $sum: 1 } } }
    ]);
    const totalEngagementTime = engagementResult[0]?.totalMs || 0;
    const sessionCount = engagementResult[0]?.count || 0;
    const averageSessionDuration = sessionCount > 0 ? totalEngagementTime / sessionCount : 0;

    const prevEngagementResult = await PdfViewLog.aggregate([
      { $match: { endTime: { $gte: prevStart, $lte: prevEnd } } },
      { $group: { _id: null, totalMs: { $sum: "$durationMs" }, count: { $sum: 1 } } }
    ]);
    const prevTotalEngagementTime = prevEngagementResult[0]?.totalMs || 0;
    const prevSessionCount = prevEngagementResult[0]?.count || 0;
    const prevAverageSessionDuration = prevSessionCount > 0 ? prevTotalEngagementTime / prevSessionCount : 0;

    // Returning Users (active in period, but created before period)
    const returningUsersResult = await LoginLog.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: "$userId" } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $match: { "user.createdAt": { $lt: start } } },
      { $count: "count" }
    ]);
    const returningUsers = returningUsersResult[0]?.count || 0;
    
    const prevReturningUsersResult = await LoginLog.aggregate([
      { $match: { createdAt: { $gte: prevStart, $lte: prevEnd } } },
      { $group: { _id: "$userId" } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $match: { "user.createdAt": { $lt: prevStart } } },
      { $count: "count" }
    ]);
    const prevReturningUsers = prevReturningUsersResult[0]?.count || 0;

    // DAU, WAU, MAU approximations
    const today = new Date();
    today.setHours(0,0,0,0);
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [dauResult, wauResult, mauResult] = await Promise.all([
      LoginLog.aggregate([{ $match: { createdAt: { $gte: today } } }, { $group: { _id: "$userId" } }, { $count: "count" }]),
      LoginLog.aggregate([{ $match: { createdAt: { $gte: sevenDaysAgo } } }, { $group: { _id: "$userId" } }, { $count: "count" }]),
      LoginLog.aggregate([{ $match: { createdAt: { $gte: thirtyDaysAgo } } }, { $group: { _id: "$userId" } }, { $count: "count" }])
    ]);

    const dau = dauResult[0]?.count || 0;
    const wau = wauResult[0]?.count || 0;
    const mau = mauResult[0]?.count || 0;

    return ApiResponse.success(res, {
      totalUsers,
      newUsers: { value: newUsers, prev: prevNewUsers },
      activeUsers: { value: activeUsers, prev: prevActiveUsers },
      totalEngagementTime: { value: totalEngagementTime, prev: prevTotalEngagementTime },
      averageSessionDuration: { value: averageSessionDuration, prev: prevAverageSessionDuration },
      returningUsers: { value: returningUsers, prev: prevReturningUsers },
      dau, wau, mau
    });

  } catch (error) {
    next(error);
  }
};

export const getActivityGraph = async (req, res, next) => {
  try {
    const { start, end } = getDateRange(req.query);
    const interval = req.query.interval || 'Daily'; // Daily, Weekly, Monthly, Yearly

    let formatString = "%Y-%m-%d";
    if (interval === 'Weekly') formatString = "%Y-%U"; // Year-Week
    else if (interval === 'Monthly') formatString = "%Y-%m";
    else if (interval === 'Yearly') formatString = "%Y";

    // New Users Graph
    const newUsersAgg = await User.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { 
        $group: { 
          _id: { $dateToString: { format: formatString, date: "$createdAt" } }, 
          count: { $sum: 1 } 
        } 
      },
      { $sort: { "_id": 1 } }
    ]);

    // Active Users Graph
    const activeUsersAgg = await LoginLog.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { 
        $group: { 
          _id: { 
            dateStr: { $dateToString: { format: formatString, date: "$createdAt" } },
            user: "$userId"
          }
        }
      },
      {
        $group: {
          _id: "$_id.dateStr",
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    // Engagement Graph
    const engagementAgg = await PdfViewLog.aggregate([
      { $match: { endTime: { $gte: start, $lte: end } } },
      { 
        $group: { 
          _id: { $dateToString: { format: formatString, date: "$endTime" } }, 
          durationMs: { $sum: "$durationMs" } 
        } 
      },
      { $sort: { "_id": 1 } }
    ]);

    // Format data into a unified array
    const labels = new Set([
      ...newUsersAgg.map(x => x._id),
      ...activeUsersAgg.map(x => x._id),
      ...engagementAgg.map(x => x._id)
    ]);

    const sortedLabels = Array.from(labels).sort();

    const data = sortedLabels.map(label => {
      const nu = newUsersAgg.find(x => x._id === label);
      const au = activeUsersAgg.find(x => x._id === label);
      const en = engagementAgg.find(x => x._id === label);
      return {
        label,
        newUsers: nu ? nu.count : 0,
        activeUsers: au ? au.count : 0,
        engagementMs: en ? en.durationMs : 0
      };
    });

    return ApiResponse.success(res, data);

  } catch (error) {
    next(error);
  }
};

export const getContentEngagement = async (req, res, next) => {
  try {
    const { start, end } = getDateRange(req.query);

    const contentAgg = await PdfViewLog.aggregate([
      { $match: { endTime: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$pdfTitle", // Use pdfTitle since pdfId might be null in some logs
          views: { $sum: 1 },
          users: { $addToSet: "$user" },
          totalTimeMs: { $sum: "$durationMs" }
        }
      },
      {
        $project: {
          content: "$_id",
          views: 1,
          uniqueUsers: { $size: "$users" },
          totalTimeMs: 1,
          avgTimeMs: { $divide: ["$totalTimeMs", "$views"] }
        }
      },
      { $sort: { totalTimeMs: -1 } },
      { $limit: 50 }
    ]);

    return ApiResponse.success(res, contentAgg);

  } catch (error) {
    next(error);
  }
};

export const getUserActivity = async (req, res, next) => {
  try {
    const { start, end } = getDateRange(req.query);
    const limit = parseInt(req.query.limit, 10) || 20;
    const page = parseInt(req.query.page, 10) || 1;
    const skip = (page - 1) * limit;

    // We can join Users and their activity
    // But it's easier to query users who were active in this period and aggregate
    const activeUserIdsResult = await PdfViewLog.aggregate([
      { $match: { endTime: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$user",
          sessions: { $sum: 1 },
          totalEngagementMs: { $sum: "$durationMs" },
          lastSeen: { $max: "$endTime" },
          contentConsumed: { $addToSet: "$pdfTitle" }
        }
      },
      { $sort: { totalEngagementMs: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]);

    // Populate user info
    const populated = await User.populate(activeUserIdsResult, { path: '_id', select: 'name email createdAt' });
    
    const formatted = populated.map(item => ({
      user: item._id, // this now has name, email, createdAt
      sessions: item.sessions,
      totalEngagementMs: item.totalEngagementMs,
      lastSeen: item.lastSeen,
      contentConsumed: item.contentConsumed
    }));

    const totalActive = await PdfViewLog.aggregate([
      { $match: { endTime: { $gte: start, $lte: end } } },
      { $group: { _id: "$user" } },
      { $count: "count" }
    ]);
    const total = totalActive[0]?.count || 0;

    return ApiResponse.paginated(res, formatted, page, limit, total);
  } catch (error) {
    next(error);
  }
};
