
const Email = require('../models/email');
const Lead = require('../models/lead');
const User = require('../models/user');

const { sendEmail, sendBulkEmails } = require('../utils/helper');
const { uploadToS3 } = require('../utils/s3Uploader');
const { simpleParser } = require('mailparser');
const Imap = require('imap');

exports.composeEmail = async (req, res) => {
  try {
    const userId = req.user.id;
    const { subject, body, leadIds } = req.body;

    const userData = await User.findById(userId);
    if (!userData) {
      return res.status(404).json({ message: "User not found" });
    }

    // Convert leadIds string to array if needed
    const leadsArray = typeof leadIds === "string" ? JSON.parse(leadIds) : leadIds;

    // Fetch leads from DB
    const leads = await Lead.find({ _id: { $in: leadsArray } });

    if (!leads.length) {
      return res.status(404).json({ message: "No leads found for these IDs" });
    }

    // Upload attachments
    let attachments = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const fileUrl = await uploadToS3(file.buffer, file.originalname);
        attachments.push({ filename: file.originalname, url: fileUrl });
      }
    }
    const emailsSent = [];

    for (const lead of leads) {
      const emailData = {
        userId,
        leadId: lead._id,
        from: userData.nexleadsEmail,
        to: lead.email, // ✅ Use DB email
        subject,
        body,
        attachments,
        type: "sent",
        folder: "sent",
      };

      const email = await Email.create(emailData);

      const trackingPixel = `
        <img src="${process.env.API_BASE_URL}/user/open/${email._id}.png" style="display:none" />
      `;

      const emailOptions = {
        from: `NexLeads <${process.env.SMTP_EMAIL}>`,
        replyTo: userData.nexleadsEmail,
        to: lead.email,
        subject,
        html: body + trackingPixel,
        attachments: attachments.map(att => ({ filename: att.filename, path: att.url })),
      };

      await sendEmail(emailOptions);

      // Update lead stats
      await Lead.findByIdAndUpdate(lead._id, {
        $inc: { emailsSent: 1 },
        lastContactedAt: new Date(),
        status: "contacted",
      });

      emailsSent.push(email);
    }

    res.status(201).json({
      message: "Emails sent successfully",
      emailsSent,
      count: emailsSent.length,
    });
  } catch (error) {
    console.error("Compose email error:", error);
    res.status(500).json({
      message: "Error sending emails",
      error: error.message,
    });
  }
};
exports.trackingEmail = async (req, res) => {
  try {
    const { emailId } = req.params;
    console.log('on tracking email', emailId);

    const email = await Email.findById(emailId);
    if (!email) return res.sendStatus(404);

    email.isOpened = true;
    email.isRead = true;
    email.folder = 'inbox';

    await email.save();

    // Return 1x1 transparent pixel
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
      'base64'
    );

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.send(pixel);

  } catch (err) {
    res.sendStatus(500);
  }
};


exports.sendBulkEmail = async (req, res) => {
  try {
    const userId = req.user._id;
    const { recipients, subject, body } = req.body;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ message: 'Recipients array is required' });
    }

    const emailPromises = recipients.map(recipient => ({
      from: req.user.nexleadsEmail,
      to: recipient.email,
      subject,
      html: body,
    }));

    const results = await sendBulkEmails(emailPromises);

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

    // Update leads
    for (const recipient of recipients) {
      if (recipient.leadId) {
        await Lead.findByIdAndUpdate(recipient.leadId, {
          $inc: { emailsSent: 1 },
          lastContactedAt: new Date(),
          status: 'contacted',
        });
      }
    }

    res.json({
      message: 'Bulk emails sent successfully',
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error sending bulk emails', error: error.message });
  }
};

exports.getEmails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { folder } = req.query;

    const filter = { userId };
    if (folder) filter.folder = folder;

    const emails = await Email.find(filter)
      .populate('leadId')
      .sort({ sentAt: -1 });

    res.json({
      count: emails.length,
      emails,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching emails', error: error.message });
  }
};

exports.getEmailById = async (req, res) => {
  try {
    const { emailId } = req.params;

    const email = await Email.findOne({
      _id: emailId,
      userId: req.user._id,
    }).populate('leadId');

    if (!email) {
      return res.status(404).json({ message: 'Email not found' });
    }

    if (!email.isRead && email.type === 'received') {
      email.isRead = true;
      await email.save();
    }

    res.json({ email });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching email', error: error.message });
  }
};

exports.saveDraft = async (req, res) => {
  try {
    const userId = req.user._id;
    const { to, subject, body } = req.body;

    const draft = await Email.create({
      userId,
      from: req.user.nexleadsEmail,
      to: to || '',
      subject: subject || '',
      body: body || '',
      type: 'draft',
      folder: 'drafts',
    });

    res.status(201).json({
      message: 'Draft saved',
      draft,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error saving draft', error: error.message });
  }
};

exports.moveToFolder = async (req, res) => {
  try {
    const { emailId } = req.params;
    const { folder } = req.body;

    const email = await Email.findOneAndUpdate(
      { _id: emailId, userId: req.user.id },
      { folder },
      { new: true }
    );

    if (!email) {
      return res.status(404).json({ message: 'Email not found' });
    }

    res.json({
      message: 'Email moved successfully',
      email,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error moving email', error: error.message });
  }
};

exports.upsetEmail = async (req, res) => {
  try {
    const userId = req.user.id;
    const { body, emailId } = req.body;

    const userData = await User.findById(userId);
    if (!userData) {
      return res.status(404).json({ message: "User not found" });
    }

     const email = await Email.findOneAndUpdate(
      { _id: emailId, userId: userId },
      { body },
      { new: true }
    );

    if (!email) {
      return res.status(404).json({ message: 'Email not found' });
    }
    const messageId = `<${email._id}@nexleads.com`;
    const threadId = email.threadId || messageId;

    const trackingPixel = `
        <img src="${process.env.API_BASE_URL}/user/open/${email._id}.png" style="display:none" />
      `;

    const emailOptions = {
      from: `NexLeads <${process.env.SMTP_EMAIL}>`,
      replyTo: userData.nexleadsEmail,
      to: email.to,
      subject: email.subject,
      html: body + trackingPixel,
      headers: {
        'Message-ID': messageId,
        'X-Entity-Ref-ID': email._id.toString(),
      }
    };

    if (email.inReplyTo) {
      emailOptions.headers['In-Reply-To'] = email.inReplyTo;
      emailOptions.headers['References'] = email.references ? email.references.join(' ') : email.inReplyTo;
    }

     const info = await sendEmail(emailOptions);
    
    // Update email with message tracking info
    email.messageId = messageId;
    email.threadId = threadId;
    email.sentAt = new Date();
    await email.save();
    
    // Update lead stats
    if (email.leadId) {
      await Lead.findByIdAndUpdate(email.leadId, {
        $inc: { emailsSent: 1 },
        lastContactedAt: new Date(),
      });
    }

    res.status(201).json({
    message: "Email sent successfully",
    email,
  });
} catch (error) {
  console.error("Compose email error:", error);
  res.status(500).json({
    message: "Error sending email",
    error: error.message,
  });
}
};

// NEW: Poll Gmail for replies
exports.checkEmailReplies = async (req, res) => {
  try {
    const userId = req.user.id;
    const userData = await User.findById(userId);
    
    if (!userData) {
      return res.status(400).json({ message: "Gmail not connected" });
    }
    
    await fetchNewReplies(userData);
    
    res.status(200).json({ message: "Email replies synced successfully" });
  } catch (error) {
    console.error("Check email replies error:", error);
    res.status(500).json({
      message: "Error checking email replies",
      error: error.message,
    });
  }
};

// Helper function to fetch new replies via IMAP
async function fetchNewReplies(userData) {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: process.env.SMTP_EMAIL,
      password: process.env.SMTP_PASSWORD,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    });
    
    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          imap.end();
          return reject(err);
        }
        
        // Search for unseen messages from the last 7 days
        const searchCriteria = ['UNSEEN', ['SINCE', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]];
        
        imap.search(searchCriteria, (err, results) => {
          if (err) {
            imap.end();
            return reject(err);
          }
          
          if (!results || results.length === 0) {
            imap.end();
            return resolve();
          }
          
          const fetch = imap.fetch(results, { bodies: '', markSeen: true });
          
          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              simpleParser(stream, async (err, parsed) => {
                if (err) {
                  console.error('Parse error:', err);
                  return;
                }
                
                try {
                  await processIncomingEmail(parsed, userData);
                } catch (error) {
                  console.error('Process incoming email error:', error);
                }
              });
            });
          });
          
          fetch.once('end', () => {
            imap.end();
            resolve();
          });
          
          fetch.once('error', (err) => {
            imap.end();
            reject(err);
          });
        });
      });
    });
    
    imap.once('error', (err) => {
      reject(err);
    });
    
    imap.connect();
  });
}

// Process incoming email and match to threads
async function processIncomingEmail(parsed, userData) {
  try {
    const inReplyTo = parsed.inReplyTo;
    const references = parsed.references || [];
    const from = parsed.from.value[0].address;
    const to = parsed.to.value[0].address;
    const subject = parsed.subject;
    const body = parsed.html || parsed.textAsHtml || parsed.text;
    
    // Find the original sent email by Message-ID
    let originalEmail = null;
    if (inReplyTo) {
      originalEmail = await Email.findOne({
        userId: userData._id,
        messageId: inReplyTo,
        type: 'sent'
      });
    }
    
    // If not found, try searching by references
    if (!originalEmail && references.length > 0) {
      originalEmail = await Email.findOne({
        userId: userData._id,
        messageId: { $in: references },
        type: 'sent'
      }).sort({ sentAt: -1 });
    }
    
    // If still not found, try matching by email address and subject
    if (!originalEmail) {
      const cleanSubject = subject.replace(/^(Re:|Fwd:)\s*/i, '').trim();
      originalEmail = await Email.findOne({
        userId: userData._id,
        to: from,
        subject: { $regex: new RegExp(cleanSubject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        type: 'sent'
      }).sort({ sentAt: -1 });
    }
    
    // Find or create lead
    let lead = null;
    if (originalEmail && originalEmail.leadId) {
      lead = await Lead.findById(originalEmail.leadId);
    } else {
      lead = await Lead.findOne({
        userId: userData._id,
        email: from
      });
    }
    
    // Create the received email record
    const receivedEmail = new Email({
      userId: userData._id,
      leadId: lead ? lead._id : null,
      from: from,
      to: to,
      subject: subject,
      body: body,
      type: 'received',
      folder: 'inbox',
      isRead: false,
      messageId: parsed.messageId,
      inReplyTo: inReplyTo,
      threadId: originalEmail ? originalEmail.threadId : parsed.messageId,
      references: references,
      receivedAt: parsed.date || new Date(),
      sentAt: parsed.date || new Date(),
    });
    
    await receivedEmail.save();
    
    // Update lead stats
    if (lead) {
      lead.responses += 1;
      lead.status = 'responded';
      await lead.save();
    }
    
    console.log(`Processed reply from ${from} for user ${userData._id}`);
  } catch (error) {
    console.error('Error processing incoming email:', error);
    throw error;
  }
}