const cron = require("node-cron");
const User = require("../models/user");
const { fetchNewReplies } = require("./emailSyncService");

exports.startEmailSyncJob = () => {
  cron.schedule('*/5 * * * *', async () => {
    console.log('Running email sync job...');
    
    try {
      const users = await User.find({ isEmailVerified: true });
      
      for (const user of users) {
        try {
          await fetchNewReplies(user);
        } catch (error) {
          console.error(`Error syncing emails for user ${user._id}:`, error);
        }
      }
      
      console.log('Email sync job completed');
    } catch (error) {
      console.error('Email sync job error:', error);
    }
  });
};