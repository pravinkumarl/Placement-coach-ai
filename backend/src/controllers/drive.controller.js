import PlacementDrive from '../models/PlacementDrive.js';
import DriveApplication from '../models/DriveApplication.js';
import { ApiError, sendSuccess, asyncHandler } from '../utils/response.js';

function branchMatches(studentBranch, eligibleBranches) {
  if (!eligibleBranches || !eligibleBranches.length) return true;
  if (!studentBranch) return true;
  const s = String(studentBranch).toLowerCase().trim();
  return eligibleBranches.some((b) => {
    const el = String(b).toLowerCase().trim();
    if (el === s) return true;
    if ((s.includes('computer') || s === 'cse' || s.includes('cs')) && (el === 'cse' || el.includes('computer') || el.includes('cs'))) return true;
    if ((s.includes('information') || s === 'it') && (el === 'it' || el.includes('information'))) return true;
    if ((s.includes('electronics') || s === 'ece') && (el === 'ece' || el.includes('electronics'))) return true;
    if ((s.includes('electrical') || s === 'eee') && (el === 'eee' || el.includes('electrical'))) return true;
    if ((s.includes('mechanical') || s === 'me') && (el === 'mechanical' || el === 'me')) return true;
    if ((s.includes('civil') || s === 'ce') && (el === 'civil' || el === 'ce')) return true;
    return false;
  });
}

/**
 * GET /api/drives — list open placement drives for students
 */
export const listOpenDrives = asyncHandler(async (req, res) => {
  const drives = await PlacementDrive.find({ status: 'Open' })
    .sort({ driveDate: 1, createdAt: -1 })
    .lean();

  let myApplications = [];
  if (req.user) {
    myApplications = await DriveApplication.find({ studentId: req.user._id }).lean();
  }

  const appMap = new Map();
  myApplications.forEach((a) => appMap.set(String(a.driveId), a.status));

  const enriched = drives.map((d) => {
    const isBranchEligible = branchMatches(req.user?.branch, d.eligibleBranches);
    const isCgpaEligible = req.user?.cgpa == null || req.user.cgpa >= d.minCgpa;
    const isReadinessEligible = (req.user?.readinessScore || 0) >= d.minReadiness;
    const isBacklogEligible = (req.user?.backlogs || 0) <= d.maxBacklogs;
    const isEligible = Boolean(isBranchEligible && isCgpaEligible && isReadinessEligible && isBacklogEligible);

    return {
      ...d,
      isEligible,
      eligibilityBreakdown: {
        isBranchEligible,
        isCgpaEligible,
        isReadinessEligible,
        isBacklogEligible,
      },
      myApplicationStatus: appMap.get(String(d._id)) || null,
    };
  });

  return sendSuccess(res, {
    drives: enriched,
    studentMetrics: {
      cgpa: req.user?.cgpa ?? null,
      readinessScore: req.user?.readinessScore || 0,
      branch: req.user?.branch || '',
      backlogs: req.user?.backlogs || 0,
    },
  });
});

/**
 * POST /api/drives/:id/apply — student applies to a drive
 */
export const applyToDrive = asyncHandler(async (req, res) => {
  const drive = await PlacementDrive.findById(req.params.id);
  if (!drive || drive.status !== 'Open') {
    throw ApiError.badRequest('This placement drive is not currently accepting applications.');
  }

  // Check if deadline has passed
  if (drive.applicationDeadline && new Date() > new Date(drive.applicationDeadline)) {
    throw ApiError.badRequest('The application deadline for this placement drive has passed.');
  }

  // Check existing application
  const existing = await DriveApplication.findOne({ driveId: drive._id, studentId: req.user._id });
  if (existing) {
    throw ApiError.conflict(`You have already applied to this drive (status: ${existing.status}).`);
  }

  const application = await DriveApplication.create({
    driveId: drive._id,
    studentId: req.user._id,
    status: 'Applied',
    history: [{ status: 'Applied', changedAt: new Date(), notes: 'Application submitted by student.' }],
  });

  return sendSuccess(res, { application }, 'Application submitted successfully.', 201);
});

/**
 * GET /api/drives/my-applications — student's own applications
 */
export const getMyApplications = asyncHandler(async (req, res) => {
  const applications = await DriveApplication.find({ studentId: req.user._id })
    .populate('driveId')
    .sort({ appliedAt: -1 })
    .lean();

  return sendSuccess(res, { applications });
});

export default { listOpenDrives, applyToDrive, getMyApplications };
