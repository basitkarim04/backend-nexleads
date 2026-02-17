// routes/contact.routes.js
const express = require('express');
const router = express.Router();
const {
  submitContactForm,
  getAllContacts,
  updateContactStatus,
} = require('../controllers/contactController');

// Public route - no authentication required

// // Protected routes - for admin dashboard
// router.get('/', authenticate, getAllContacts);
// router.patch('/:id/status', authenticate, updateContactStatus);

module.exports = router;