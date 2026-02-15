const User = require('../models/user');
const Lead = require('../models/lead');
const Subscription = require('../models/subscription');

/**
 * @route   GET /api/admin/dashboard/stats
 * @desc    Get admin dashboard statistics (total users, leads, earnings)
 * @access  Private/Admin
 */
exports.getDashboardStats = async (req, res) => {
  try {
    // Get total users count (only users with type === "User")
    const totalUsers = await User.countDocuments({ type: 'User' });

    // Get total leads count
    const totalLeads = await Lead.countDocuments();

    // Calculate total platform earnings from active subscriptions
    const activeSubscriptions = await Subscription.find({ status: 'active' });
    const totalEarnings = activeSubscriptions.reduce((sum, sub) => sum + (sub.price || 0), 0);

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalLeads,
        totalEarnings
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics',
      error: error.message
    });
  }
};

/**
 * @route   GET /api/admin/dashboard/users
 * @desc    Get all users with their subscription details
 * @access  Private/Admin
 */
exports.getAllUsers = async (req, res) => {
  try {
    const { search } = req.query;

    // Build query for users with type === "User"
    let userQuery = { type: 'User' };
    
    // Add search filter if provided
    if (search) {
      userQuery.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Get all users
    const users = await User.find(userQuery).select('-password');

    // Get subscription details for each user
    const usersWithDetails = await Promise.all(
      users.map(async (user) => {
        // Get active subscription (current package)
        const activeSubscription = await Subscription.findOne({
          userId: user._id,
          status: 'active'
        }).sort({ createdAt: -1 });

        // Get previous subscription (most recent inactive)
        const previousSubscription = await Subscription.findOne({
          userId: user._id,
          status: { $ne: 'active' }
        }).sort({ createdAt: -1 });

        // Count leads for this user
        const leadCount = await Lead.countDocuments({ userId: user._id });

        return {
          id: user._id,
          name: user.name || 'N/A',
          email: user.email,
          previousPackage: previousSubscription ? previousSubscription.plan : 'None',
          currentPackage: activeSubscription ? activeSubscription.plan : 'Free',
          leads: leadCount,
          blocked: user.blocked || false,
          createdAt: user.createdAt
        };
      })
    );

    res.status(200).json({
      success: true,
      data: usersWithDetails
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
};

/**
 * @route   PUT /api/admin/dashboard/users/:userId/block
 * @desc    Block or unblock a user
 * @access  Private/Admin
 */
exports.toggleUserBlock = async (req, res) => {
  try {
    const { userId } = req.params;

    // Find user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Toggle blocked status
    user.blocked = !user.blocked;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User ${user.blocked ? 'blocked' : 'unblocked'} successfully`,
      data: {
        userId: user._id,
        blocked: user.blocked
      }
    });
  } catch (error) {
    console.error('Error toggling user block:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle user block status',
      error: error.message
    });
  }
};

/**
 * @route   GET /api/admin/dashboard/users/:userId
 * @desc    Get single user details
 * @access  Private/Admin
 */
exports.getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get all subscriptions for this user
    const subscriptions = await Subscription.find({ userId }).sort({ createdAt: -1 });
    
    // Get leads for this user
    const leads = await Lead.find({ userId }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: {
        user,
        subscriptions,
        leads
      }
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user details',
      error: error.message
    });
  }
};