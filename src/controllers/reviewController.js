import Review from '../models/Review.js';
import ApiResponse from '../utils/ApiResponse.js';
import { sendReviewAppreciationEmail } from '../services/emailService.js';
import { Filter } from 'bad-words';

const filter = new Filter();
// Add common hindi slang just in case
filter.addWords('chutiya', 'mc', 'bc', 'bhosdike', 'madarchod', 'bhenchod', 'gandu', 'randi', 'sala', 'saala', 'kutta', 'kaminey');

/**
 * GET /api/reviews
 * Public — returns all approved reviews, newest first.
 */
export const getReviews = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find({ approved: true })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments({ approved: true }),
    ]);

    return ApiResponse.paginated(res, reviews, page, limit, total);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/reviews
 * Authenticated — create or update the current user's review.
 */
export const createReview = async (req, res, next) => {
  try {
    const { rating, content } = req.body;
    const userId = req.user._id;
    const displayName = req.user.name;

    if (filter.isProfane(content)) {
      return ApiResponse.badRequest(res, 'Your review contains inappropriate language and cannot be submitted.');
    }

    if (!req.user.totalWatchTimeMs || req.user.totalWatchTimeMs < 600000) {
      return ApiResponse.badRequest(res, 'You need at least 10 minutes of watch time before you can submit a review.');
    }

    const existingReview = await Review.findOne({ user: userId });

    if (existingReview) {
      return ApiResponse.badRequest(res, 'You have already submitted a review. Only 1 review is allowed per user.');
    }

    const review = await Review.create({
      user: userId,
      displayName,
      rating,
      content,
      approved: true,
    });

    // Send appreciation email only if this is their first time submitting a review
    sendReviewAppreciationEmail(req.user.email, displayName).catch(err => 
      console.error('[DIAGNOSTIC] Appreciation email failed:', err.message)
    );

    return ApiResponse.created(res, review, 'Review submitted successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/reviews
 * Authenticated — delete the current user's review.
 */
export const deleteReview = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const review = await Review.findOneAndDelete({ user: userId });

    if (!review) {
      return ApiResponse.notFound(res, 'No review found to delete.');
    }

    return ApiResponse.success(res, null, 'Review deleted successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/reviews/:id/react
 * Authenticated — toggle reaction on a review.
 */
export const toggleReaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const review = await Review.findById(id);
    if (!review) {
      return ApiResponse.notFound(res, 'Review not found.');
    }

    const hasReacted = review.reactions.includes(userId);
    
    if (hasReacted) {
      // Remove reaction
      review.reactions = review.reactions.filter(
        (reactorId) => reactorId.toString() !== userId.toString()
      );
      if (req.user.role === 'admin') {
        review.likedByAdmin = false;
      }
    } else {
      // Add reaction
      review.reactions.push(userId);
      if (req.user.role === 'admin') {
        review.likedByAdmin = true;
      }
    }

    await review.save();

    return ApiResponse.success(res, review, hasReacted ? 'Reaction removed' : 'Reaction added');
  } catch (error) {
    next(error);
  }
};
