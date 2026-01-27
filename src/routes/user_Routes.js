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

const router = express.Router();

router.post("/signup", signup);
router.post("/verify-email", verifyEmail);

router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.get('/profile', verifyToken, getProfile);

router.get('/stats', verifyToken, getDashboardStats);

router.get('/search', verifyToken, leadControllers.searchLeads);
router.post('/save-lead', verifyToken, checkLeadsLimit, leadControllers.saveLead);
router.get('/get-my-Leads', verifyToken, leadControllers.getMyLeads);
router.put('/:leadId/status', verifyToken, leadControllers.updateLeadStatus);

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
router.get('/:emailId', verifyToken, emailsController.getEmailById);
router.post('/draft', verifyToken, emailsController.saveDraft);
router.put('/:emailId-move', verifyToken, emailsController.moveToFolder);


router.post('/create-project', verifyToken, projectsController.createProject);
router.get('/get-projects', verifyToken, projectsController.getProjects);
router.get('/:projectId', verifyToken, projectsController.getProjectById);
router.put('/:projectId', verifyToken, projectsController.updateProject);
router.put('/:projectId/status', verifyToken, projectsController.updateProjectStatus);
router.delete('/:projectId', verifyToken, projectsController.deleteProject);

router.get('/followUp-stats', verifyToken, followupsController.getFollowUpStats);
router.post('/followUp-record', verifyToken, followupsController.createFollowUpRecord);
router.post('/:followUpId/send', verifyToken, followupsController.sendFollowUp);
router.put('/:followUpId', verifyToken, followupsController.updateFollowUpStats);


router.put('/personal', verifyToken, settingsController.updatePersonalInfo)
router.post(
  '/profile-picture',
  verifyToken,
  upload.single('profilePicture'),
  settingsController.uploadProfilePicture
);
router.put('/password', verifyToken, settingsController.changePassword);
router.get('/plans', settingsController.getSubscriptionPlans);
router.post('/subscription', verifyToken, settingsController.updateSubscription);
router.get('/subscription/history', verifyToken, settingsController.getSubscriptionHistory);

module.exports = router;