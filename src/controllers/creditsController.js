import CreditSection from '../models/CreditSection.js';
import CreditMember from '../models/CreditMember.js';
import ApiResponse from '../utils/ApiResponse.js';
import { uploadImage, deleteFile } from '../services/imagekitService.js';

// --- Public Endpoints ---
export const getPublicCredits = async (req, res, next) => {
  try {
    const sections = await CreditSection.find({ isPublished: true }).sort({ displayOrder: 1 }).lean();
    
    const populatedSections = await Promise.all(
      sections.map(async (section) => {
        const members = await CreditMember.find({ sectionId: section._id, isVisible: true })
          .sort({ displayOrder: 1 })
          .lean();
        return { ...section, members };
      })
    );

    return ApiResponse.success(res, populatedSections, 'Public credits fetched successfully');
  } catch (error) {
    next(error);
  }
};

// --- Admin Section Endpoints ---
export const getAllSections = async (req, res, next) => {
  try {
    const sections = await CreditSection.find().sort({ displayOrder: 1 });
    return ApiResponse.success(res, sections, 'Sections fetched successfully');
  } catch (error) {
    next(error);
  }
};

export const createSection = async (req, res, next) => {
  try {
    const section = await CreditSection.create(req.body);
    return ApiResponse.created(res, section, 'Section created successfully');
  } catch (error) {
    next(error);
  }
};

export const updateSection = async (req, res, next) => {
  try {
    const { id } = req.params;
    const section = await CreditSection.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
    if (!section) return ApiResponse.notFound(res, 'Section not found');
    return ApiResponse.success(res, section, 'Section updated successfully');
  } catch (error) {
    next(error);
  }
};

export const deleteSection = async (req, res, next) => {
  try {
    const { id } = req.params;
    const section = await CreditSection.findByIdAndDelete(id);
    if (!section) return ApiResponse.notFound(res, 'Section not found');
    
    // delete all members in this section
    await CreditMember.deleteMany({ sectionId: id });
    
    return ApiResponse.success(res, null, 'Section deleted successfully');
  } catch (error) {
    next(error);
  }
};

// --- Admin Member Endpoints ---
export const getMembersBySection = async (req, res, next) => {
  try {
    const { sectionId } = req.params;
    const members = await CreditMember.find({ sectionId }).sort({ displayOrder: 1 });
    return ApiResponse.success(res, members, 'Members fetched successfully');
  } catch (error) {
    next(error);
  }
};

export const createMember = async (req, res, next) => {
  try {
    const { sectionId } = req.params;
    const memberData = { ...req.body, sectionId };
    
    if (req.file) {
      const uploadResult = await uploadImage(req.file.buffer, req.file.originalname, '/credits');
      memberData.photoUrl = uploadResult.url;
    }
    
    const member = await CreditMember.create(memberData);
    return ApiResponse.created(res, member, 'Member created successfully');
  } catch (error) {
    next(error);
  }
};

export const updateMember = async (req, res, next) => {
  try {
    const { id } = req.params;
    const memberData = { ...req.body };
    
    if (req.file) {
      const uploadResult = await uploadImage(req.file.buffer, req.file.originalname, '/credits');
      memberData.photoUrl = uploadResult.url;
    }
    
    const member = await CreditMember.findByIdAndUpdate(id, memberData, { new: true, runValidators: true });
    if (!member) return ApiResponse.notFound(res, 'Member not found');
    return ApiResponse.success(res, member, 'Member updated successfully');
  } catch (error) {
    next(error);
  }
};

export const deleteMember = async (req, res, next) => {
  try {
    const { id } = req.params;
    const member = await CreditMember.findByIdAndDelete(id);
    if (!member) return ApiResponse.notFound(res, 'Member not found');
    return ApiResponse.success(res, null, 'Member deleted successfully');
  } catch (error) {
    next(error);
  }
};
