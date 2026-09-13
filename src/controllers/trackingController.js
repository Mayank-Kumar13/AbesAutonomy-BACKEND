import User from '../models/User.js';
import PdfViewLog from '../models/PdfViewLog.js';

export const pingLocation = async (req, res) => {
  try {
    const user = req.user;
    const { location, pdfId, pdfTitle } = req.body;
    
    // Update User model safely
    try {
      await User.findByIdAndUpdate(user._id, {
        currentLocation: location || '/',
        currentPdfId: pdfId || null,
        currentPdfTitle: pdfTitle || null,
        lastActiveAt: new Date()
      });
    } catch (err) {
      console.error("User update error in ping:", err);
    }

    // If viewing a PDF, update or create PdfViewLog
    if (pdfTitle) {
      try {
        const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000);
        
        const recentLog = await PdfViewLog.findOne({
          user: user._id,
          pdfTitle: pdfTitle,
          endTime: { $gte: twoMinsAgo }
        });

        if (recentLog) {
          recentLog.endTime = new Date();
          recentLog.durationMs = recentLog.endTime.getTime() - recentLog.startTime.getTime();
          await recentLog.save();
        } else {
          await PdfViewLog.create({
            user: user._id,
            userName: user.name || "Unknown User",
            userEmail: user.email || "Unknown Email",
            pdfId: pdfId || null,
            pdfTitle: pdfTitle,
            startTime: new Date(),
            endTime: new Date(),
            durationMs: 0
          });
        }
      } catch (err) {
        console.error("PdfViewLog error in ping:", err);
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Ping Error:", error);
    res.status(500).json({ success: false, error: error.message, stack: error.stack });
  }
};

export const getLiveUsers = async (req, res) => {
  // Keeping this for backwards compatibility just in case
  try {
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeUsers = await User.find({
      lastActiveAt: { $gte: fiveMinsAgo }
    }).select('name role currentLocation currentPdfId currentPdfTitle lastActiveAt').lean();
    const formattedUsers = activeUsers.map(u => ({
      userId: u._id.toString(),
      name: u.name,
      role: u.role,
      location: u.currentLocation || '/',
      pdfId: u.currentPdfId || null,
      pdfTitle: u.currentPdfTitle || null,
      updatedAt: u.lastActiveAt
    }));
    res.status(200).json({ success: true, data: formattedUsers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, stack: error.stack });
  }
};

export const getPdfLogs = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const logs = await PdfViewLog.find()
      .sort({ endTime: -1 })
      .limit(limit)
      .lean();
    
    res.status(200).json({ success: true, data: logs });
  } catch (error) {
    console.error("Logs Error:", error);
    res.status(500).json({ success: false, error: error.message, stack: error.stack });
  }
};
