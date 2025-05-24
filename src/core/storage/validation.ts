import { z } from 'zod';

export const PullRequestSchema = z.object({
  number: z.number().int().positive(),
  repository: z.string().min(1),
  author: z.string().min(1),
  title: z.string(),
  created_at: z.string(),
  merged_at: z.string().nullable(),
  additions: z.number().int().min(0).default(0),
  deletions: z.number().int().min(0).default(0),
  changed_files: z.number().int().min(0).default(0),
  has_tests: z.boolean().default(false),
  synced_at: z.string(),
});

export const ReviewSchema = z.object({
  pr_number: z.number().int().positive(),
  repository: z.string().min(1),
  reviewer: z.string().min(1),
  state: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED']),
  submitted_at: z.string(),
  synced_at: z.string(),
});

export const StatsSchema = z.object({
  repository: z.string().min(1),
  author: z.string().min(1),
  period_start: z.string(),
  period_end: z.string(),
  prs_created: z.number().int().min(0).default(0),
  prs_merged: z.number().int().min(0).default(0),
  lines_added: z.number().int().min(0).default(0),
  lines_deleted: z.number().int().min(0).default(0),
  reviews_given: z.number().int().min(0).default(0),
  reviews_received: z.number().int().min(0).default(0),
  avg_pr_size: z.number().min(0).default(0),
  synced_at: z.string(),
});

export const validatePullRequest = (data: unknown) => PullRequestSchema.parse(data);
export const validateReview = (data: unknown) => ReviewSchema.parse(data);
export const validateStats = (data: unknown) => StatsSchema.parse(data);

export const validatePullRequestPartial = (data: unknown) => PullRequestSchema.partial().parse(data);
export const validateReviewPartial = (data: unknown) => ReviewSchema.partial().parse(data);
export const validateStatsPartial = (data: unknown) => StatsSchema.partial().parse(data);