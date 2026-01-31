const { fetchLeadsFromPlatforms } = require("../utils/leadfetcher");
const Lead = require('../models/lead');

exports.searchLeads = async (req, res) => {
  try {
    const userId = req.user._id;
    const { keyword, platforms, dateFrom, dateTo } = req.query;

    if (!keyword) {
      return res.status(400).json({ message: 'Keyword is required' });
    }

    const platformArray = platforms
      ? platforms.split(',')
      : ['LinkedIn', 'Upwork', 'Twitter', 'Facebook'];

    const filters = {
      dateFrom: dateFrom ? new Date(dateFrom) : null,
      dateTo: dateTo ? new Date(dateTo) : null,
    };

    // 1️⃣ Fetch leads
    const fetchedLeads = await fetchLeadsFromPlatforms(
      keyword,
      platformArray,
      filters
    );

    if (!fetchedLeads.length) {
      return res.json({ message: 'No leads found', leads: [] });
    }

    // 2️⃣ Remove duplicates (email + userId based)
    const existingLeads = await Lead.find({
      userId,
      email: { $in: fetchedLeads.map(l => l.email) },
    }).select('email');

    const existingEmails = new Set(existingLeads.map(l => l.email));

    const newLeads = fetchedLeads.filter(
      lead => !existingEmails.has(lead.email)
    );

    // 3️⃣ Save new leads
    const leadsToSave = newLeads.map(lead => ({
      ...lead,
      userId,
    }));

    const savedLeads = await Lead.insertMany(leadsToSave);

    // 4️⃣ Update subscription usage
    req.user.subscription.leadsUsed += savedLeads.length;
    await req.user.save();

    // 5️⃣ Response
    res.status(201).json({
      message: 'Leads fetched & saved successfully',
      fetched: fetchedLeads.length,
      saved: savedLeads.length,
      leads: savedLeads,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching/saving leads',
      error: error.message,
    });
  }
};

exports.saveLead = async (req, res) => {
  try {
    const userId = req.user._id;
    const leadData = { ...req.body, userId };

    const lead = await Lead.create(leadData);

    // Update leads used count
    req.user.subscription.leadsUsed += 1;
    await req.user.save();

    res.status(201).json({
      message: 'Lead saved successfully',
      lead,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error saving lead', error: error.message });
  }
};

exports.getMyLeads = async (req, res) => {
  try {
    const userId = req.user.id;
    
    const leads = await Lead.find({
      userId: userId
    }).sort({ createdAt: -1 });

    res.json({
      count: leads.length,
      leads,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching leads', error: error.message });
  }
};

exports.updateLeadStatus = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { status } = req.body;

    const lead = await Lead.findOneAndUpdate(
      { _id: leadId, userId: req.user._id },
      { status },
      { new: true }
    );

    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    res.json({
      message: 'Lead status updated',
      lead,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating lead', error: error.message });
  }
};
