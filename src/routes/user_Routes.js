const express = require('express');
const { signup, login, forgotPassword, resetPassword, getProfile, verifyEmail } = require('../controllers/authController');
const { verifyToken } = require('../middlewares/jwtToken');
const { getDashboardStats } = require('../controllers/dashboardController');
const leadControllers = require('../controllers/leadController');
const emailsController = require('../controllers/emailController');
const projectsController = require('../controllers/projectController');
const followupsController = require('../controllers/followUpController');
const settingsController = require('../controllers/settingContoller');
const { checkBulkEmailAccess, validateEmail, handleValidationErrors, checkLeadsLimit } = require('../middlewares/validate');
const { upload } = require('../middlewares/upload');
const { generateOrRewriteEmail } = require('../controllers/gptContoroller');
const { submitContactForm } = require('../controllers/contactController');

const router = express.Router();

router.post("/signup", signup);
router.post("/verify-email", verifyEmail);

router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.get('/profile', verifyToken, getProfile);

router.get('/stats', verifyToken, getDashboardStats);

router.get('/search', verifyToken, checkLeadsLimit, leadControllers.searchLeads);
router.post('/save-lead', verifyToken, checkLeadsLimit, leadControllers.saveLead);
router.get('/get-my-Leads', verifyToken, leadControllers.getMyLeads);
router.put('/leads/:leadId/status', verifyToken, leadControllers.updateLeadStatus);
router.put('/leads-interest/:leadId', verifyToken, leadControllers.updateLeadInterest);

router.post(
  '/compose',
  verifyToken,
  upload.array('attachments', 5),
  validateEmail,
  handleValidationErrors,
  emailsController.composeEmail
);

router.post('/bulk', verifyToken, checkBulkEmailAccess, emailsController.sendBulkEmail);
router.get('/get-emails', verifyToken, emailsController.getEmails);
router.post('/upset-email', verifyToken, emailsController.upsetEmail);
router.post('/draft', verifyToken, emailsController.saveDraft);
router.put('/move/:emailId', verifyToken, emailsController.moveToFolder);


router.get('/open/:emailId.png', emailsController.trackingEmail);
router.post('/check-replies',  emailsController.checkEmailReplies);

// router.get('/:emailId', verifyToken, emailsController.getEmailById);

router.post("/ai-assist", verifyToken, generateOrRewriteEmail);


router.post('/create-project', verifyToken, projectsController.createProject);
router.get('/get-projects', verifyToken, projectsController.getProjects);
router.get('/get-project/:projectId', verifyToken, projectsController.getProjectById);
router.put('/project-upset//:projectId', verifyToken, projectsController.updateProject);
router.put('/project/:projectId/status', verifyToken, projectsController.updateProjectStatus);
router.delete('/project-del/:projectId', verifyToken, projectsController.deleteProject);

router.get('/followUp-stats', verifyToken, followupsController.getFollowUpStats);
router.post('/followUp-record', verifyToken, followupsController.createFollowUpRecord);
router.post('/:followUpId/send', verifyToken, followupsController.sendFollowUp);
router.put('/followups/:followUpId', verifyToken, followupsController.updateFollowUpStats);


router.put('/personal', verifyToken, settingsController.updatePersonalInfo)
router.post(
  '/profile-picture',
  verifyToken,
  upload.single('profilePicture'),
  settingsController.uploadProfilePicture
);
router.put('/password', verifyToken, settingsController.changePassword);
router.get('/plans', settingsController.getSubscriptionPlans);
router.post('/payment-intent', verifyToken, settingsController.createPaymentIntent);
router.post('/subscription', verifyToken, settingsController.updateSubscription);
router.get('/subscription/history', verifyToken, settingsController.getSubscriptionHistory);
router.post('/subscription/cancel', verifyToken, settingsController.cancelSubscription);

router.post('/submit-contact-form', submitContactForm);

module.exports = router;