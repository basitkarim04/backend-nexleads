const User = require('../models/user');
const Subscription = require('../models/Subscription');
const bcrypt = require('bcryptjs');

exports.updatePersonalInfo = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, email } = req.body;

    const updates = {};
    if (name) updates.name = name;
    if (email) {
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      updates.email = email;
    }

    const user = await User.findByIdAndUpdate(userId, updates, { new: true }).select('-password');

    res.json({
      message: 'Personal information updated',
      user,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating personal info', error: error.message });
  }
};

exports.uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Upload to S3
    const imageUrl = await uploadToS3(
      req.file.buffer,
      req.file.originalname
    );

    // Update user profile picture
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { profilePicture: imageUrl },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Profile picture updated",
      profilePicture: user.profilePicture,
    });
  } catch (error) {
    console.error("S3 upload error:", error);
    res.status(500).json({
      message: "Error uploading profile picture",
      error: error.message,
    });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(userId);

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error changing password', error: error.message });
  }
};

exports.getSubscriptionPlans = async (req, res) => {
  try {
    const plans = [
      {
        name: 'Free',
        price: 0,
        features: [
          'Up to 30 leads per month',
          'Basic email templates',
          'Limited follow-up tracking',
          'No bulk email feature',
        ],
        leadsLimit: 30,
      },
      {
        name: 'Pro',
        price: 29,
        features: [
          'Up to 100 leads per month',
          'Custom email sequences',
          'Bulk email feature',
          'AI-assisted email writing',
        ],
        leadsLimit: 100,
      },
      {
        name: 'Platinum',
        price: 99,
        features: [
          'Unlimited leads',
          'All advanced features',
          'Priority support',
          'Advanced analytics',
        ],
        leadsLimit: -1,
      },
    ];

    res.json({ plans });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching plans', error: error.message });
  }
};

exports.updateSubscription = async (req, res) => {
  try {
    const userId = req.user._id;
    const { plan, paymentMethod, transactionId } = req.body;

    const planDetails = {
      free: { leadsLimit: 30, price: 0 },
      pro: { leadsLimit: 100, price: 29 },
      platinum: { leadsLimit: -1, price: 99 },
    };

    if (!planDetails[plan]) {
      return res.status(400).json({ message: 'Invalid plan' });
    }

    // Create subscription record
    await Subscription.create({
      userId,
      plan,
      price: planDetails[plan].price,
      paymentMethod,
      transactionId,
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Update user subscription
    const user = await User.findByIdAndUpdate(
      userId,
      {
        'subscription.plan': plan,
        'subscription.leadsLimit': planDetails[plan].leadsLimit,
        'subscription.leadsUsed': 0,
        'subscription.resetDate': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      { new: true }
    ).select('-password');

    res.json({
      message: 'Subscription updated successfully',
      subscription: user.subscription,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating subscription', error: error.message });
  }
};

exports.getSubscriptionHistory = async (req, res) => {
  try {
    const userId = req.user._id;

    const subscriptions = await Subscription.find({ userId }).sort({ startDate: -1 });

    res.json({
      count: subscriptions.length,
      subscriptions,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching subscription history', error: error.message });
  }
};