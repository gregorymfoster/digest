import { AnalyticsResult } from '../analytics/pipeline.js';


export const formatAsJson = (data: AnalyticsResult): string => {
  return JSON.stringify(data, null, 2);
};

export const formatAsCsv = (data: AnalyticsResult): string => {
  const lines: string[] = [];
  
  // Header with metadata
  lines.push(`# Digest Analytics Export`);
  lines.push(`# Generated: ${data.generatedAt}`);
  lines.push(`# Timeframe: ${data.overview.timeframe}`);
  lines.push(`# Repositories: ${data.overview.repositories.join(', ')}`);
  lines.push('');
  
  // Summary section
  lines.push('## Summary');
  lines.push('metric,value');
  lines.push(`total_prs,${data.overview.totalPRs}`);
  lines.push(`total_contributors,${data.overview.totalContributors}`);
  lines.push(`total_reviews,${data.overview.totalReviews}`);
  lines.push(`avg_pr_size,${data.contributors.avgPRSize.toFixed(2)}`);
  lines.push(`test_rate,${(data.contributors.testRate * 100).toFixed(1)}%`);
  lines.push('');
  
  // Contributors section
  lines.push('## Top Contributors');
  lines.push('rank,author,prs,lines_changed,avg_merge_time');
  data.contributors.topContributors.forEach((contributor, index) => {
    lines.push([
      index + 1,
      escapeCSVField(contributor.author),
      contributor.prs,
      contributor.lines,
      escapeCSVField(contributor.avgMergeTime)
    ].join(','));
  });
  lines.push('');
  
  // Review Metrics section
  lines.push('## Review Metrics');
  lines.push('metric,value');
  lines.push(`avg_time_to_first_review,${escapeCSVField(data.reviews.avgMetrics.timeToFirstReview)}`);
  lines.push(`avg_time_to_merge,${escapeCSVField(data.reviews.avgMetrics.timeToMerge)}`);
  lines.push(`avg_reviews_per_pr,${data.reviews.avgMetrics.reviewsPerPR.toFixed(2)}`);
  lines.push('');
  
  // Top Reviewers section
  lines.push('## Top Reviewers');
  lines.push('reviewer,reviews_given,avg_response_time_hours,approval_rate,repositories');
  data.reviews.topReviewers.forEach(reviewer => {
    lines.push([
      escapeCSVField(reviewer.reviewer),
      reviewer.reviewsGiven,
      reviewer.avgResponseTime.toFixed(2),
      `${(reviewer.approvalRate * 100).toFixed(1)}%`,
      escapeCSVField(reviewer.repositories.join('; '))
    ].join(','));
  });
  
  return lines.join('\n');
};

const escapeCSVField = (field: string): string => {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
};