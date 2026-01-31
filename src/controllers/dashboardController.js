const Email = require('../models/email');
const Lead = require('../models/lead');
const Project = require('../models/project');

exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const totalEmailsSent = await Email.countDocuments({ 
      userId, 
      type: 'sent' 
    });

    const totalEmailsOpened = await Email.countDocuments({ 
      userId, 
      isOpened: true 
    });

    const totalResponses = await Email.countDocuments({ 
      userId, 
      type: 'received' 
    });

    const totalLeads = await Lead.countDocuments({ userId });

    const emailBreakdown = {
      sent: totalEmailsSent,
      opened: totalEmailsOpened,
      responded: totalResponses,
    };

    const platformBreakdown = await Lead.aggregate([
      { $match: { userId: userId } },
      { $group: { _id: '$platform', count: { $sum: 1 } } },
    ]);

    const activeProjects = await Project.find({ 
      userId, 
      status: { $in: ['in_discussion', 'ongoing'] } 
    })
      .populate('leadId')
      .limit(5)
      .sort({ createdAt: -1 });

    const leadFunnel = {
      leads: totalLeads,
      emails: totalEmailsSent,
      responses: totalResponses,
      projects: await Project.countDocuments({ userId }),
    };

    res.json({
      stats: {
        totalEmailsSent,
        totalEmailsOpened,
        totalResponses,
        totalLeads,
      },
      emailBreakdown,
      platformBreakdown,
      activeProjects,
      leadFunnel,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching dashboard stats', error: error.message });
  }
};

