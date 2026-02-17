    // controllers/contact.controller.js
const Contact = require('../models/contact');
const { transporter } = require('../utils/helper');

exports.submitContactForm = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    // Validation
    if (!name || !email || !phone || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required',
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    // Get IP address
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;

    // Save to database
    const contact = new Contact({
      name,
      email,
      phone,
      subject,
      message,
      ipAddress,
    });

    await contact.save();

    // Send email to admin
    const adminEmailOptions = {
      from: `"NexLeads Contact Form" <${process.env.SMTP_EMAIL}>`,
      to: process.env.ADMIN_EMAIL || process.env.SMTP_EMAIL,
      subject: `New Contact Form Submission: ${subject}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f9f9f9;
              border-radius: 10px;
            }
            .header {
              background: linear-gradient(135deg, #021024 0%, #052659 100%);
              color: white;
              padding: 20px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: white;
              padding: 30px;
              border-radius: 0 0 10px 10px;
            }
            .field {
              margin-bottom: 20px;
              padding-bottom: 15px;
              border-bottom: 1px solid #eee;
            }
            .field-label {
              font-weight: bold;
              color: #052659;
              margin-bottom: 5px;
              display: block;
            }
            .field-value {
              color: #333;
              margin-top: 5px;
            }
            .message-box {
              background-color: #f5f5f5;
              padding: 15px;
              border-left: 4px solid #8eaee0;
              border-radius: 5px;
              margin-top: 10px;
            }
            .footer {
              text-align: center;
              margin-top: 20px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              color: #666;
              font-size: 12px;
            }
            .badge {
              display: inline-block;
              background-color: #8eaee0;
              color: white;
              padding: 5px 10px;
              border-radius: 15px;
              font-size: 12px;
              margin-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2 style="margin: 0;">🔔 New Contact Form Submission</h2>
              <span class="badge">NexLeads Website</span>
            </div>
            <div class="content">
              <div class="field">
                <span class="field-label">👤 Name:</span>
                <span class="field-value">${name}</span>
              </div>

              <div class="field">
                <span class="field-label">📧 Email:</span>
                <span class="field-value"><a href="mailto:${email}">${email}</a></span>
              </div>

              <div class="field">
                <span class="field-label">📱 Phone:</span>
                <span class="field-value"><a href="tel:${phone}">${phone}</a></span>
              </div>

              <div class="field">
                <span class="field-label">📝 Subject:</span>
                <span class="field-value">${subject}</span>
              </div>

              <div class="field" style="border-bottom: none;">
                <span class="field-label">💬 Message:</span>
                <div class="message-box">
                  ${message.replace(/\n/g, '<br>')}
                </div>
              </div>

              <div class="footer">
                <p>Submitted on: ${new Date().toLocaleString()}</p>
                <p>IP Address: ${ipAddress}</p>
                <p style="margin-top: 15px; color: #999;">
                  This is an automated message from NexLeads Contact Form
                </p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    // Send confirmation email to user
    const userEmailOptions = {
      from: `"NexLeads" <${process.env.SMTP_EMAIL}>`,
      to: email,
      subject: 'Thank you for contacting NexLeads',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f9f9f9;
              border-radius: 10px;
            }
            .header {
              background: linear-gradient(135deg, #021024 0%, #052659 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: white;
              padding: 30px;
              border-radius: 0 0 10px 10px;
            }
            .highlight {
              background-color: #f0f7ff;
              padding: 20px;
              border-left: 4px solid #8eaee0;
              border-radius: 5px;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #eee;
              color: #666;
              font-size: 14px;
            }
            .button {
              display: inline-block;
              padding: 12px 30px;
              background-color: #8eaee0;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">✅ Message Received!</h1>
            </div>
            <div class="content">
              <p>Hi <strong>${name}</strong>,</p>
              
              <p>Thank you for reaching out to <strong>NexLeads</strong>! We've received your message and appreciate you taking the time to contact us.</p>

              <div class="highlight">
                <strong>What happens next?</strong><br>
                Our team will review your inquiry and get back to you within 24-48 hours. We're excited to help you scale your journey!
              </div>

              <p><strong>Your message details:</strong></p>
              <ul>
                <li><strong>Subject:</strong> ${subject}</li>
                <li><strong>Submitted:</strong> ${new Date().toLocaleString()}</li>
              </ul>

              <p>If you have any urgent matters, feel free to reach out to us directly at <a href="mailto:${process.env.SMTP_EMAIL}">${process.env.SMTP_EMAIL}</a>.</p>

              <div class="footer">
                <p><strong>NexLeads</strong></p>
                <p>Scaling Your Business Growth</p>
                <p style="margin-top: 15px; color: #999; font-size: 12px;">
                  This is an automated confirmation email. Please do not reply to this message.
                </p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    // Send both emails
    await Promise.all([
      transporter.sendMail(adminEmailOptions),
      transporter.sendMail(userEmailOptions),
    ]);

    res.status(201).json({
      success: true,
      message: 'Thank you for your message! We will get back to you soon.',
      data: {
        id: contact._id,
        name: contact.name,
        email: contact.email,
      },
    });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Optional: Get all contact submissions (for admin dashboard)
exports.getAllContacts = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = status ? { status } : {};
    const skip = (page - 1) * limit;

    const contacts = await Contact.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Contact.countDocuments(query);

    res.status(200).json({
      success: true,
      data: contacts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching contacts',
      error: error.message,
    });
  }
};

// Optional: Update contact status
exports.updateContactStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['new', 'read', 'responded', 'archived'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status',
      });
    }

    const contact = await Contact.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Contact status updated',
      data: contact,
    });
  } catch (error) {
    console.error('Update contact status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating contact status',
      error: error.message,
    });
  }
};