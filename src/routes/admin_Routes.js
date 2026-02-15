const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getAllUsers,
  toggleUserBlock,
  getUserDetails
} = require('../controllers/adminDashboardController');
const { verifyToken } = require('../middlewares/jwtToken');


// Apply authentication and admin-only middleware to all routes
router.use(verifyToken);

// @route   GET /api/admin/dashboard/stats
// @desc    Get dashboard statistics
router.get('/stats', getDashboardStats);

// @route   GET /api/admin/dashboard/users
// @desc    Get all users with details
router.get('/users', getAllUsers);

// @route   GET /api/admin/dashboard/users/:userId
// @desc    Get single user details
router.get('/users/:userId', getUserDetails);

// @route   PUT /api/admin/dashboard/users/:userId/block
// @desc    Block/Unblock a user
router.put('/users/:userId/block', toggleUserBlock);

module.exports = router;