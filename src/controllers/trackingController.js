const activeUsers = new Map();

export const pingLocation = (req, res) => {
  const user = req.user;
  const { location, pdfId, pdfTitle } = req.body;
  
  activeUsers.set(user._id.toString(), {
    userId: user._id.toString(),
    name: user.name,
    role: user.role,
    location: location || '/',
    pdfId: pdfId || null,
    pdfTitle: pdfTitle || null,
    updatedAt: new Date().toISOString()
  });

  // Cleanup old users (inactive for 5 mins)
  const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
  for (const [key, value] of activeUsers.entries()) {
    if (new Date(value.updatedAt) < fiveMinsAgo) {
      activeUsers.delete(key);
    }
  }

  res.status(200).json({ success: true });
};

export const getLiveUsers = (req, res) => {
  // Cleanup old users
  const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
  for (const [key, value] of activeUsers.entries()) {
    if (new Date(value.updatedAt) < fiveMinsAgo) {
      activeUsers.delete(key);
    }
  }
  
  const userList = Array.from(activeUsers.values());
  res.status(200).json({ success: true, data: userList });
};
