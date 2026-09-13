import User from '../models/User.js';

export const pingLocation = async (req, res) => {
  try {
    const user = req.user;
    const { location, pdfId, pdfTitle } = req.body;
    
    await User.findByIdAndUpdate(user._id, {
      currentLocation: location || '/',
      currentPdfId: pdfId || null,
      currentPdfTitle: pdfTitle || null,
      lastActiveAt: new Date()
    });

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getLiveUsers = async (req, res) => {
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
