import mongoose from 'mongoose';
import Roadmap from '../models/Roadmap.js';
import {
  ensureDefaultRoadmap,
  generateRoadmap,
  mapCategoryToModule,
} from '../services/roadmap.service.js';
import { recalculateReadiness } from '../services/performance.service.js';
import { ApiError, sendSuccess, asyncHandler } from '../utils/response.js';

const MILESTONE_STATUSES = ['pending', 'in_progress', 'completed'];

/**
 * GET /api/roadmap
 */
export const getRoadmap = asyncHandler(async (req, res) => {
  const roadmap = (await Roadmap.findOne({ userId: req.user._id })) ||
    (await ensureDefaultRoadmap(req.user._id));

  return sendSuccess(res, { roadmap });
});

/**
 * PATCH /api/roadmap/milestones/:milestoneId/start
 * Opens a milestone and links it to its activity module.
 */
export const startMilestone = asyncHandler(async (req, res) => {
  const { milestoneId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(milestoneId)) {
    throw ApiError.badRequest('Invalid milestone id.');
  }

  const roadmap = (await Roadmap.findOne({ userId: req.user._id })) ||
    (await ensureDefaultRoadmap(req.user._id));

  const milestone = roadmap.milestones.id(milestoneId);
  if (!milestone) throw ApiError.notFound('Milestone not found.');
  if (milestone.status === 'completed') {
    throw ApiError.conflict('This milestone is already completed.');
  }

  milestone.status = 'in_progress';
  if (!milestone.startedAt) milestone.startedAt = new Date();
  milestone.completedAt = null;
  roadmap.recalculate();
  await roadmap.save();
  const readiness = await recalculateReadiness(req.user._id);

  const moduleKey = mapCategoryToModule(milestone.category);
  const url = moduleKey
    ? `live-assessment.html?module=${encodeURIComponent(moduleKey)}&roadmapId=${encodeURIComponent(milestoneId)}`
    : null;

  return sendSuccess(
    res,
    {
      roadmap,
      readinessScore: readiness,
      milestone,
      activity: moduleKey ? { moduleKey, url } : null,
    },
    'Milestone started.'
  );
});

/**
 * PATCH /api/roadmap/milestones/:milestoneId
 * Update status (and optionally title/description) of one milestone.
 */
export const updateMilestone = asyncHandler(async (req, res) => {
  const { milestoneId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(milestoneId)) {
    throw ApiError.badRequest('Invalid milestone id.');
  }

  const roadmap = (await Roadmap.findOne({ userId: req.user._id })) ||
    (await ensureDefaultRoadmap(req.user._id));

  const milestone = roadmap.milestones.id(milestoneId);
  if (!milestone) throw ApiError.notFound('Milestone not found.');

  const { status, title, description, estimatedHours } = req.body || {};

  if (status !== undefined) {
    if (!MILESTONE_STATUSES.includes(status)) {
      throw ApiError.badRequest('status must be pending, in_progress or completed.');
    }
    if (status === 'completed') {
      throw ApiError.badRequest(
        'Milestones are completed automatically when the linked assessment or activity is completed.'
      );
    }
    milestone.status = status;
    if (status === 'in_progress' && !milestone.startedAt) milestone.startedAt = new Date();
    milestone.completedAt = null;
  }
  if (title !== undefined) milestone.title = String(title).trim().slice(0, 160);
  if (description !== undefined) milestone.description = String(description).slice(0, 600);
  if (estimatedHours !== undefined) milestone.estimatedHours = Number(estimatedHours) || 0;

  roadmap.recalculate();
  await roadmap.save();
  const readiness = await recalculateReadiness(req.user._id);

  return sendSuccess(
    res,
    { roadmap, readinessScore: readiness },
    'Roadmap updated.'
  );
});

/**
 * PATCH /api/roadmap/milestones/:milestoneId/reorder
 */
export const reorderMilestone = asyncHandler(async (req, res) => {
  const { milestoneId } = req.params;
  const targetOrder = Number(req.body?.order);

  const roadmap = await Roadmap.findOne({ userId: req.user._id });
  if (!roadmap) throw ApiError.notFound('Roadmap not found.');

  const milestone = roadmap.milestones.id(milestoneId);
  if (!milestone) throw ApiError.notFound('Milestone not found.');
  if (!Number.isInteger(targetOrder) || targetOrder < 1 || targetOrder > roadmap.milestones.length) {
    throw ApiError.badRequest(`order must be between 1 and ${roadmap.milestones.length}.`);
  }

  // Reorder within the document array.
  const docs = roadmap.milestones.toObject();
  const moving = docs.find((m) => String(m._id) === milestoneId);
  const without = docs.filter((m) => String(m._id) !== milestoneId);
  without.splice(targetOrder - 1, 0, moving);
  roadmap.milestones = without;
  roadmap.milestones.forEach((m, index) => {
    m.order = index + 1;
  });

  await roadmap.save();
  return sendSuccess(res, { roadmap }, 'Milestone reordered.');
});

/**
 * POST /api/roadmap/generate
 * Personalised roadmap (Gemini when configured, deterministic plan otherwise).
 */
export const regenerateRoadmap = asyncHandler(async (req, res) => {
  const roadmap = await generateRoadmap(req.user._id);
  const readiness = await recalculateReadiness(req.user._id);
  return sendSuccess(
    res,
    { roadmap, readinessScore: readiness },
    roadmap.generatedBy === 'gemini'
      ? 'Roadmap regenerated with AI.'
      : 'Roadmap regenerated with the default plan (AI unavailable).'
  );
});

/**
 * DELETE /api/roadmap
 * Reset to the neutral starter plan.
 */
export const resetRoadmap = asyncHandler(async (req, res) => {
  await Roadmap.deleteOne({ userId: req.user._id });
  const roadmap = await ensureDefaultRoadmap(req.user._id);
  const readiness = await recalculateReadiness(req.user._id);
  return sendSuccess(res, { roadmap, readinessScore: readiness }, 'Roadmap reset.');
});

/**
 * POST /api/roadmap
 * Add a custom milestone to the student's plan.
 */
export const createMilestone = asyncHandler(async (req, res) => {
  const { title, description = '', category = 'general', estimatedHours = 4 } = req.body || {};
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) throw ApiError.badRequest('title is required.');
  if (cleanTitle.length > 160) throw ApiError.badRequest('title must be at most 160 characters.');

  const roadmap = (await Roadmap.findOne({ userId: req.user._id })) ||
    (await ensureDefaultRoadmap(req.user._id));

  roadmap.milestones.push({
    title: cleanTitle,
    description: String(description).slice(0, 600),
    category: String(category).slice(0, 60),
    estimatedHours: Number(estimatedHours) || 4,
    order: roadmap.milestones.length + 1,
    status: 'pending',
    completedAt: null,
  });

  roadmap.recalculate();
  await roadmap.save();
  const readiness = await recalculateReadiness(req.user._id);

  return sendSuccess(res, { roadmap, readinessScore: readiness }, 'Milestone added.', 201);
});

/**
 * PUT /api/roadmap/:milestoneId
 * Update the descriptive fields of one milestone.
 */
export const replaceMilestone = asyncHandler(async (req, res) => {
  const { milestoneId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(milestoneId)) {
    throw ApiError.badRequest('Invalid milestone id.');
  }

  const roadmap = (await Roadmap.findOne({ userId: req.user._id })) ||
    (await ensureDefaultRoadmap(req.user._id));

  const milestone = roadmap.milestones.id(milestoneId);
  if (!milestone) throw ApiError.notFound('Milestone not found.');

  const { title, description, category, estimatedHours } = req.body || {};
  if (title !== undefined) {
    const cleanTitle = String(title).trim();
    if (!cleanTitle) throw ApiError.badRequest('title cannot be empty.');
    milestone.title = cleanTitle.slice(0, 160);
  }
  if (description !== undefined) milestone.description = String(description).slice(0, 600);
  if (category !== undefined) milestone.category = String(category).slice(0, 60);
  if (estimatedHours !== undefined) milestone.estimatedHours = Number(estimatedHours) || 0;

  roadmap.recalculate();
  await roadmap.save();
  const readiness = await recalculateReadiness(req.user._id);

  return sendSuccess(res, { roadmap, readinessScore: readiness }, 'Milestone updated.');
});

/**
 * DELETE /api/roadmap/:milestoneId
 * Remove one milestone and renumber the rest.
 */
export const deleteMilestone = asyncHandler(async (req, res) => {
  const { milestoneId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(milestoneId)) {
    throw ApiError.badRequest('Invalid milestone id.');
  }

  const roadmap = (await Roadmap.findOne({ userId: req.user._id })) ||
    (await ensureDefaultRoadmap(req.user._id));

  const milestone = roadmap.milestones.id(milestoneId);
  if (!milestone) throw ApiError.notFound('Milestone not found.');

  milestone.deleteOne();
  roadmap.milestones.forEach((m, index) => {
    m.order = index + 1;
  });

  roadmap.recalculate();
  await roadmap.save();
  const readiness = await recalculateReadiness(req.user._id);

  return sendSuccess(res, { roadmap, readinessScore: readiness }, 'Milestone deleted.');
});

export default {
  getRoadmap,
  createMilestone,
  startMilestone,
  updateMilestone,
  replaceMilestone,
  deleteMilestone,
  reorderMilestone,
  regenerateRoadmap,
  resetRoadmap,
};
