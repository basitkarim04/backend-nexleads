const FollowUp = require('../models/FollowUp');
const Email = require('../models/email');
const { sendBulkEmails } = require('../utils/helper');


exports.getFollowUpStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const { platform, dateFrom, dateTo } = req.query;

    const filter = { userId };
    if (platform) filter.platform = platform;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    const followUps = await FollowUp.find(filter).sort({ createdAt: -1 });

    res.json({
      count: followUps.length,
      followUps,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching follow-ups', error: error.message });
  }
};

exports.sendFollowUp = async (req, res) => {
  try {
    const userId = req.user._id;
    const { followUpId } = req.params;
    const { subject, body, recipients } = req.body;

    const followUp = await FollowUp.findOne({ _id: followUpId, userId });
    if (!followUp) {
      return res.status(404).json({ message: 'Follow-up record not found' });
    }

    // Send emails to recipients
    const emailPromises = recipients.map(recipient => ({
      from: req.user.nexleadsEmail,
      to: recipient.email,
      subject,
      html: body,
    }));

    await sendBulkEmails(emailPromises);

    // Save emails to database
    const emailDocs = recipients.map(recipient => ({
      userId,
      leadId: recipient.leadId,
      from: req.user.nexleadsEmail,
      to: recipient.email,
      subject,
      body,
      type: 'sent',
      folder: 'sent',
    }));

    await Email.insertMany(emailDocs);

    // Update follow-up stats
    followUp.followUpsSent += recipients.length;
    followUp.lastFollowUpDate = new Date();
    await followUp.save();

    res.json({
      message: 'Follow-up emails sent successfully',
      followUp,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error sending follow-up', error: error.message });
  }
};

exports.createFollowUpRecord = async (req, res) => {
  try {
    const userId = req.user._id;
    const { jobField, platform, totalLeadsSent } = req.body;

    const followUp = await FollowUp.create({
      userId,
      jobField,
      platform,
      totalLeadsSent,
    });

    res.status(201).json({
      message: 'Follow-up record created',
      followUp,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating follow-up record', error: error.message });
  }
};

exports.updateFollowUpStats = async (req, res) => {
  try {
    const { followUpId } = req.params;
    const updates = req.body;

    const followUp = await FollowUp.findOneAndUpdate(
      { _id: followUpId, userId: req.user._id },
      updates,
      { new: true }
    );

    if (!followUp) {
      return res.status(404).json({ message: 'Follow-up record not found' });
    }

    res.json({
      message: 'Follow-up stats updated',
      followUp,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating follow-up stats', error: error.message });
  }
};
