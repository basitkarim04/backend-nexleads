const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { transporter, generateNexleadsEmail } = require('../utils/helper');

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });
};

exports.signup = async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;

  try {

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await User.create({
      name,
      email,
      type: 'User',
      password,
      emailOtp: otp,
      emailOtpExpires: Date.now() + 10 * 60 * 1000, // 10 min
    });

    await transporter.sendMail({
      from: `"NexLeads" <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: "Verification Code",
      html: `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Email Verification</h2>
      <p>Your verification code is:</p>
      <h1 style="letter-spacing: 4px;">${otp}</h1>
      <p>This code will expire in 10 minutes.</p>
      <p>If you did not request this, please ignore this email.</p>
    </div>
  `,
    });



    res.status(200).json({
      success: true,
      message: "Verification code sent to email",
    });
  } catch (error) {
    res.status(500).json({ message: err.message });
  }
};

exports.verifyEmail = async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    return res.status(400).json({ message: "User not found" });
  }

  if (user.emailOtp !== otp) {
    return res.status(400).json({ message: "Invalid code" });
  }

  if (user.emailOtpExpires < Date.now()) {
    return res.status(400).json({ message: "Code expired" });
  }

  user.isEmailVerified = true;
  user.emailOtp = undefined;
  user.emailOtpExpires = undefined;

  const nexleadsEmail = generateNexleadsEmail(user.name);
  user.nexleadsEmail = nexleadsEmail;

  await user.save();

  const token = generateToken(user._id);

  res.status(200).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      type: user.type,
    },
  });
};


// Login
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    if (user.blocked) {
      return res.status(403).json({ message: 'User is blocked. Please contact support.' });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email, type: user.type }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Forgot Password (Send reset link)
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    // Send email
    const resetUrl = `${process.env.FRONTEND_URL}/login?token=${resetToken}`;

    await transporter.sendMail({
      to: email,
      subject: 'Password Reset Request',
      html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. Link expires in 10 minutes.</p>`
    });

    res.json({ success: true, message: 'Reset link sent to email' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Reset Password (from token)
exports.resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password, confirmPassword } = req.body;

  if (password !== confirmPassword) return res.status(400).json({ message: 'Passwords do not match' });

  try {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ message: 'Invalid or expired token' });

    user.password = password; // Will be hashed by pre-save hook
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successful' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching profile', error: error.message });
  }
};