const mongoose = require('mongoose');

const emailSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
  },
  from: {
    type: String,
    required: true,
  },
  to: {
    type: String,
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  body: {
    type: String,
    required: true,
  },
  attachments: [{
    filename: String,
    url: String,
  }],
  type: {
    type: String,
    enum: ['sent', 'received', 'draft'],
    default: 'sent',
  },
  folder: {
    type: String,
    enum: ['inbox', 'sent', 'drafts', 'spam', 'trash'],
    default: 'sent',
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  isOpened: {
    type: Boolean,
    default: false,
  },
  isBounced: {
    type: Boolean,
    default: false,
  },
  sentAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Email', emailSchema);