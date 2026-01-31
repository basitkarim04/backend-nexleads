const Project = require('../models/project');
const Lead = require('../models/lead');

exports.createProject = async (req, res) => {
  try {
    const userId = req.user.id;
    const { leadId, title, company, description, budget, deadline } = req.body;

    const lead = await Lead.findOne({ _id: leadId, userId });
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }
      const existingProject = await Project.findOne({ leadId, userId });
    
    if (existingProject) {
      return res.status(200).json({
        message: 'Project already exists for this lead',
        project: existingProject,
      });
    }

    const project = await Project.create({
      userId,
      leadId,
      title,
      description,
      company,
      budget,
      deadline,
      status: 'in_discussion',
    });

    await lead.save();

    res.status(201).json({
      message: 'Project created successfully',
      project,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating project', error: error.message });
  }
};

exports.getProjects = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    console.log('on this function')

    const filter = { userId };
    if (status) filter.status = status;

    const projects = await Project.find(filter)
      .populate('leadId')
      .sort({ createdAt: -1 });

    const grouped = {
      in_discussion: projects.filter(p => p.status === 'in_discussion'),
      ongoing: projects.filter(p => p.status === 'ongoing'),
      completed: projects.filter(p => p.status === 'completed'),
    };

    res.json({
      count: projects.length,
      projects: grouped,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching projects', error: error.message });
  }
};

exports.updateProjectStatus = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status } = req.body;

    const project = await Project.findOneAndUpdate(
      { _id: projectId, userId: req.user.id },
      { status },
      { new: true }
    ).populate('leadId');

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Update timestamps
    if (status === 'ongoing' && !project.startedAt) {
      project.startedAt = new Date();
    }
    if (status === 'completed' && !project.completedAt) {
      project.completedAt = new Date();
    }
    await project.save();

    // Update lead status
    await Lead.findByIdAndUpdate(project.leadId, { status });

    res.json({
      message: 'Project status updated',
      project,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating project', error: error.message });
  }
};

exports.getProjectById = async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findOne({
      _id: projectId,
      userId: req.user._id,
    }).populate('leadId');

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    res.json({ project });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching project', error: error.message });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const updates = req.body;

    const project = await Project.findOneAndUpdate(
      { _id: projectId, userId: req.user.id },
      updates,
      { new: true }
    ).populate('leadId');

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    res.json({
      message: 'Project updated successfully',
      project,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating project', error: error.message });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findOneAndDelete({
      _id: projectId,
      userId: req.user._id,
    });

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting project', error: error.message });
  }
};