const { body, validationResult } = require('express-validator');
const User = require('../models/user');

exports.checkLeadsLimit = async (req, res, next) => {
  try {
    // verifyToken ne sirf id diya hai
    const userId = req.user.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(401).json({
        message: 'User not found',
      });
    }

    if (!user.subscription) {
      return res.status(400).json({
        message: 'Subscription not found for user',
      });
    }

    const { leadsUsed, leadsLimit, resetDate } = user.subscription;

    if (!resetDate || new Date() >= new Date(resetDate)) {
      user.subscription.leadsUsed = 0;
      user.subscription.resetDate = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      );
      await user.save();
    }

    if (leadsUsed >= leadsLimit) {
      return res.status(403).json({
        message: 'Lead limit reached for this month. Please upgrade your plan.',
        leadsUsed,
        leadsLimit,
      });
    }

    req.user = user;

    next();
  } catch (error) {
    res.status(500).json({
      message: 'Error checking plan limits',
      error: error.message,
    });
  }
};
exports.checkBulkEmailAccess = async (req, res, next) => {
  try {
    const user = req.user;

    if (user.subscription.plan === 'free') {
      return res.status(403).json({
        message: 'Bulk email feature is not available in Free plan. Please upgrade to Pro or Platinum.',
      });
    }

    next();
  } catch (error) {
    res.status(500).json({ message: 'Error checking plan access', error: error.message });
  }
};

exports.validateEmail = [
  // body('to').isEmail().withMessage('Valid recipient email is required'),
  body('subject').notEmpty().withMessage('Subject is required'),
  body('body').notEmpty().withMessage('Email body is required'),
];

exports.handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};
