import User from '../models/User.js';
import PdfViewLog from '../models/PdfViewLog.js';

export const pingLocation = async (req, res) => {
  try {
    const user = req.user;
    const { location, pdfId, pdfTitle } = req.body;
    
    // Update User model
    await User.findByIdAndUpdate(user._id, {
      currentLocation: location || '/',
      currentPdfId: pdfId || null,
      currentPdfTitle: pdfTitle || null,
      lastActiveAt: new Date()
    });

    // If viewing a PDF, update or create PdfViewLog
    if (pdfTitle) {
      // Check if there is a recent log for this user and this PDF (within last 2 minutes)
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
          userName: user.name,
          userEmail: user.email,
          pdfId: pdfId || null,
          pdfTitle: pdfTitle,
          startTime: new Date(),
          endTime: new Date(),
          durationMs: 0
        });
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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
    res.status(500).json({ success: false, error: error.message });
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
    res.status(500).json({ success: false, error: error.message });
  }
};
