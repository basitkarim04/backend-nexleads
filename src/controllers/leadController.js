const { fetchLeadsFromPlatforms, validateEnv } = require("../utils/leadfetcher");
const Lead = require('../models/lead');

exports.searchLeads = async (req, res) => {
  try {
    validateEnv();

    const userId = req.user._id;
    const { keyword, platforms, dateFrom, dateTo } = req.query;

    if (!keyword) {
      return res.status(400).json({ message: 'Keyword is required' });
    }

    const platformArray = platforms
      ? platforms.split(',').map(p => p.trim())
      : ['Google', 'LinkedIn', 'Upwork', 'Twitter', 'Facebook', 'Reddit'];

    const filters = {
      dateFrom: dateFrom ? new Date(dateFrom) : null,
      dateTo:   dateTo   ? new Date(dateTo)   : null,
    };

    // 1️⃣ Fetch from all platforms
    const fetchedLeads = await fetchLeadsFromPlatforms(keyword, platformArray, filters);

    if (!fetchedLeads.length) {
      return res.json({ message: 'No leads found', leads: [] });
    }

    // 2️⃣ Dedup against existing DB records
    const existingLeads = await Lead.find({
      userId,
      email: { $in: fetchedLeads.map(l => l.email) },
    }).select('email');

    const existingEmails = new Set(existingLeads.map(l => l.email));
    const newLeads = fetchedLeads.filter(l => !existingEmails.has(l.email));

    if (!newLeads.length) {
      return res.json({
        message: 'All fetched leads already exist in your database',
        fetched: fetchedLeads.length,
        saved: 0,
        leads: [],
      });
    }

    // 3️⃣ Save to DB
    const savedLeads = await Lead.insertMany(newLeads.map(l => ({ ...l, userId })));

    // 4️⃣ Update subscription usage counter
    req.user.subscription.leadsUsed += savedLeads.length;
    await req.user.save();

    // 5️⃣ Respond
    res.status(201).json({
      message: 'Leads fetched & saved successfully',
      fetched: fetchedLeads.length,
      saved:   savedLeads.length,
      leads:   savedLeads,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching/saving leads', error: error.message });
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


exports.updateLeadInterest = async (req, res) => {
  try {
    const { leadId } = req.params;
    const { interest } = req.body;

    const lead = await Lead.findOneAndUpdate(
      { _id: leadId, userId: req.user.id },
      { interest },
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
