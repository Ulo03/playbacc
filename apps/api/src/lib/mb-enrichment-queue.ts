/**
 * MusicBrainz Enrichment Queue
 *
 * Provides a DB-backed job queue for background MusicBrainz enrichment.
 * Jobs are enqueued when entities are created/updated and processed by
 * the MB enrichment worker.
 *
 * Features:
 * - Dedupe: Only one active job per (job_type, entity_type, entity_id)
 * - Batch claiming with "skip locked" semantics for worker safety
 * - Retry with exponential backoff on failure
 * - TTL cleanup to prevent unbounded table growth
 *
 * @module mb-enrichment-queue
 */

import { db } from '../db'
import { eq, and, sql, lt, lte, inArray, or } from 'drizzle-orm'
import { mb_enrichment_jobs, artists, albums, tracks } from '@playbacc/types/db/schema'

// =============================================================================
// Types
// =============================================================================

/** Job types for MusicBrainz enrichment */
export type MbEnrichmentJobType =
	| 'artist.resolve_mbid'
	| 'artist.sync_relationships'
	| 'album.resolve_mbid'
	| 'album.sync'
	| 'track.resolve_mbid'
	| 'track.sync'

/** Entity types that can be enriched */
export type MbEnrichmentEntityType = 'artist' | 'album' | 'track'

/** Job status */
export type MbEnrichmentJobStatus = 'pending' | 'running' | 'succeeded' | 'failed'

/** A job from the queue */
export interface MbEnrichmentJob {
	id: string
	job_type: MbEnrichmentJobType
	entity_type: MbEnrichmentEntityType
	entity_id: string
	status: MbEnrichmentJobStatus
	priority: number
	attempts: number
	max_attempts: number
	run_after: Date
	locked_at: Date | null
	locked_by: string | null
	last_error: string | null
	created_at: Date
	updated_at: Date
}

/** Options for enqueueing a job */
export interface EnqueueJobOptions {
	/** Job type to perform */
	jobType: MbEnrichmentJobType
	/** Entity type */
	entityType: MbEnrichmentEntityType
	/** Entity ID to enrich */
	entityId: string
	/** Priority (higher = processed first), default 0 */
	priority?: number
	/** Maximum retry attempts, default 3 */
	maxAttempts?: number
}

/** Result of enqueueing a job */
export interface EnqueueResult {
	/** Whether a new job was created */
	created: boolean
	/** The job ID (new or existing) */
	jobId: string | null
	/** Reason if not created */
	reason?: 'already_active' | 'entity_not_found'
}

// =============================================================================
// Configuration
// =============================================================================

/** Queue configuration */
export const QUEUE_CONFIG = {
	/** Default max attempts before marking as permanently failed */
	defaultMaxAttempts: 3,
	/** Base backoff delay in milliseconds */
	baseBackoffMs: 60_000, // 1 minute
	/** Maximum backoff delay in milliseconds */
	maxBackoffMs: 3600_000, // 1 hour
	/** Backoff multiplier (exponential) */
	backoffMultiplier: 2,
	/** Job TTL in days (for cleanup) */
	jobTtlDays: parseInt(process.env.MB_ENRICHMENT_JOB_TTL_DAYS || '3', 10),
	/** Lock timeout in minutes (jobs locked longer than this can be reclaimed) */
	lockTimeoutMinutes: 30,
}

// =============================================================================
// Enqueue
// =============================================================================

/**
 * Enqueues a MusicBrainz enrichment job.
 * Uses database-level dedupe via partial unique index to prevent race conditions.
 * The index ensures only one active (pending/running) job exists per (job_type, entity_type, entity_id).
 *
 * @param options - Job options
 * @returns Enqueue result
 */
export async function enqueueJob(options: EnqueueJobOptions): Promise<EnqueueResult> {
	const {
		jobType,
		entityType,
		entityId,
		priority = 0,
		maxAttempts = QUEUE_CONFIG.defaultMaxAttempts,
	} = options

	try {
		// Try to insert - the partial unique index will reject duplicates atomically
		const result = await db
			.insert(mb_enrichment_jobs)
			.values({
				job_type: jobType,
				entity_type: entityType,
				entity_id: entityId,
				status: 'pending',
				priority,
				max_attempts: maxAttempts,
				run_after: new Date(),
			})
			.onConflictDoNothing()
			.returning({ id: mb_enrichment_jobs.id })

		if (result.length > 0) {
			return {
				created: true,
				jobId: result[0].id,
			}
		}

		// Insert was rejected due to conflict - find the existing active job
		const existingActive = await db.query.mb_enrichment_jobs.findFirst({
			where: (jobs, { eq, and, inArray }) =>
				and(
					eq(jobs.job_type, jobType),
					eq(jobs.entity_type, entityType),
					eq(jobs.entity_id, entityId),
					inArray(jobs.status, ['pending', 'running'])
				),
		})

		return {
			created: false,
			jobId: existingActive?.id ?? null,
			reason: 'already_active',
		}
	} catch (error) {
		// Handle unique constraint violation (fallback for edge cases)
		const message = error instanceof Error ? error.message : String(error)
		if (message.includes('unique') || message.includes('duplicate')) {
			const existingActive = await db.query.mb_enrichment_jobs.findFirst({
				where: (jobs, { eq, and, inArray }) =>
					and(
						eq(jobs.job_type, jobType),
						eq(jobs.entity_type, entityType),
						eq(jobs.entity_id, entityId),
						inArray(jobs.status, ['pending', 'running'])
					),
			})

			return {
				created: false,
				jobId: existingActive?.id ?? null,
				reason: 'already_active',
			}
		}
		throw error
	}
}

/**
 * Enqueues multiple jobs in a batch.
 * Skips jobs that already have an active instance.
 *
 * @param jobs - Array of job options
 * @returns Array of enqueue results
 */
export async function enqueueJobs(jobs: EnqueueJobOptions[]): Promise<EnqueueResult[]> {
	const results: EnqueueResult[] = []

	for (const job of jobs) {
		const result = await enqueueJob(job)
		results.push(result)
	}

	return results
}

// =============================================================================
// Claim
// =============================================================================

/**
 * Claims a batch of jobs for processing.
 * Uses UPDATE ... WHERE with row-level locking semantics.
 *
 * @param workerId - Unique identifier for this worker instance
 * @param batchSize - Maximum number of jobs to claim
 * @returns Array of claimed jobs
 */
export async function claimJobs(
	workerId: string,
	batchSize: number = 25
): Promise<MbEnrichmentJob[]> {
	const now = new Date()

	// Find claimable jobs:
	// - status = 'pending' AND run_after <= now
	// - OR status = 'running' AND locked_at is old (stale lock)
	const staleThreshold = new Date(
		now.getTime() - QUEUE_CONFIG.lockTimeoutMinutes * 60 * 1000
	)

	// Use a single query to claim jobs atomically
	// The subquery uses FOR UPDATE SKIP LOCKED to prevent race conditions:
	// - FOR UPDATE: locks selected rows so other workers can't claim them
	// - SKIP LOCKED: skips rows already locked by other workers instead of waiting
	const claimedJobs = await db
		.update(mb_enrichment_jobs)
		.set({
			status: 'running',
			locked_at: now,
			locked_by: workerId,
			updated_at: now,
		})
		.where(
			and(
				// Job must be claimable
				or(
					// Pending and ready to run
					and(
						eq(mb_enrichment_jobs.status, 'pending'),
						lte(mb_enrichment_jobs.run_after, now)
					),
					// Or running but lock is stale
					and(
						eq(mb_enrichment_jobs.status, 'running'),
						lt(mb_enrichment_jobs.locked_at, staleThreshold)
					)
				),
				// Limit to jobs we can select (use subquery for ordering/limit)
				inArray(
					mb_enrichment_jobs.id,
					db
						.select({ id: mb_enrichment_jobs.id })
						.from(mb_enrichment_jobs)
						.where(
							or(
								and(
									eq(mb_enrichment_jobs.status, 'pending'),
									lte(mb_enrichment_jobs.run_after, now)
								),
								and(
									eq(mb_enrichment_jobs.status, 'running'),
									lt(mb_enrichment_jobs.locked_at, staleThreshold)
								)
							)
						)
						.orderBy(
							sql`${mb_enrichment_jobs.priority} DESC`,
							sql`${mb_enrichment_jobs.created_at} ASC`
						)
						.limit(batchSize)
						.for('update', { skipLocked: true })
				)
			)
		)
		.returning()

	return claimedJobs as MbEnrichmentJob[]
}

// =============================================================================
// Complete / Fail
// =============================================================================

/**
 * Marks a job as successfully completed.
 * Also updates the entity's mb_last_enriched_at timestamp.
 *
 * @param jobId - Job ID
 */
export async function completeJob(jobId: string): Promise<void> {
	const now = new Date()

	// Get job details first to update entity timestamp
	const job = await db.query.mb_enrichment_jobs.findFirst({
		where: (jobs, { eq }) => eq(jobs.id, jobId),
	})

	if (!job) {
		console.warn(`[MbQueue] Job ${jobId} not found for completion`)
		return
	}

	// Update job status
	await db
		.update(mb_enrichment_jobs)
		.set({
			status: 'succeeded',
			locked_at: null,
			locked_by: null,
			updated_at: now,
		})
		.where(eq(mb_enrichment_jobs.id, jobId))

	// Update entity's mb_last_enriched_at
	await updateEntityEnrichedAt(job.entity_type as MbEnrichmentEntityType, job.entity_id, now)
}

/**
 * Marks a job as failed with an error message.
 * Increments attempts and schedules retry with exponential backoff,
 * or marks as permanently failed if max attempts reached.
 *
 * @param jobId - Job ID
 * @param error - Error message
 */
export async function failJob(jobId: string, error: string): Promise<void> {
	const now = new Date()

	// Get current job state
	const job = await db.query.mb_enrichment_jobs.findFirst({
		where: (jobs, { eq }) => eq(jobs.id, jobId),
	})

	if (!job) {
		console.warn(`[MbQueue] Job ${jobId} not found for failure`)
		return
	}

	const newAttempts = job.attempts + 1
	const isPermanentlyFailed = newAttempts >= job.max_attempts

	if (isPermanentlyFailed) {
		// Mark as permanently failed
		await db
			.update(mb_enrichment_jobs)
			.set({
				status: 'failed',
				attempts: newAttempts,
				last_error: error,
				locked_at: null,
				locked_by: null,
				updated_at: now,
			})
			.where(eq(mb_enrichment_jobs.id, jobId))
	} else {
		// Schedule retry with exponential backoff
		const backoffMs = Math.min(
			QUEUE_CONFIG.baseBackoffMs * Math.pow(QUEUE_CONFIG.backoffMultiplier, newAttempts - 1),
			QUEUE_CONFIG.maxBackoffMs
		)
		const runAfter = new Date(now.getTime() + backoffMs)

		await db
			.update(mb_enrichment_jobs)
			.set({
				status: 'pending',
				attempts: newAttempts,
				last_error: error,
				run_after: runAfter,
				locked_at: null,
				locked_by: null,
				updated_at: now,
			})
			.where(eq(mb_enrichment_jobs.id, jobId))

		console.log(
			`[MbQueue] Job ${jobId} failed (attempt ${newAttempts}/${job.max_attempts}), ` +
				`retry after ${Math.round(backoffMs / 1000)}s`
		)
	}
}

/**
 * Updates the mb_last_enriched_at timestamp for an entity.
 *
 * @param entityType - Entity type
 * @param entityId - Entity ID
 * @param timestamp - Timestamp to set
 */
async function updateEntityEnrichedAt(
	entityType: MbEnrichmentEntityType,
	entityId: string,
	timestamp: Date
): Promise<void> {
	switch (entityType) {
		case 'artist':
			await db
				.update(artists)
				.set({ mb_last_enriched_at: timestamp })
				.where(eq(artists.id, entityId))
			break
		case 'album':
			await db
				.update(albums)
				.set({ mb_last_enriched_at: timestamp })
				.where(eq(albums.id, entityId))
			break
		case 'track':
			await db
				.update(tracks)
				.set({ mb_last_enriched_at: timestamp })
				.where(eq(tracks.id, entityId))
			break
		default:
			console.warn(`[MbQueue] Unknown entity type: ${entityType}`)
	}
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Cleans up old jobs based on TTL configuration.
 * Deletes succeeded jobs and terminal failed jobs older than the TTL.
 *
 * @returns Number of jobs deleted
 */
export async function cleanupOldJobs(): Promise<number> {
	const ttlMs = QUEUE_CONFIG.jobTtlDays * 24 * 60 * 60 * 1000
	const cutoff = new Date(Date.now() - ttlMs)

	// Delete succeeded and terminal failed jobs older than TTL
	const result = await db
		.delete(mb_enrichment_jobs)
		.where(
			and(
				inArray(mb_enrichment_jobs.status, ['succeeded', 'failed']),
				lt(mb_enrichment_jobs.updated_at, cutoff)
			)
		)
		.returning({ id: mb_enrichment_jobs.id })

	return result.length
}

// =============================================================================
// Query Helpers
// =============================================================================

/**
 * Gets a job by ID.
 *
 * @param jobId - Job ID
 * @returns Job or null if not found
 */
export async function getJob(jobId: string): Promise<MbEnrichmentJob | null> {
	const job = await db.query.mb_enrichment_jobs.findFirst({
		where: (jobs, { eq }) => eq(jobs.id, jobId),
	})
	return job as MbEnrichmentJob | null
}

/**
 * Gets queue statistics.
 *
 * @returns Queue stats by status
 */
export async function getQueueStats(): Promise<{
	pending: number
	running: number
	succeeded: number
	failed: number
	total: number
}> {
	const result = await db
		.select({
			status: mb_enrichment_jobs.status,
			count: sql<number>`count(*)::int`,
		})
		.from(mb_enrichment_jobs)
		.groupBy(mb_enrichment_jobs.status)

	const stats = {
		pending: 0,
		running: 0,
		succeeded: 0,
		failed: 0,
		total: 0,
	}

	for (const row of result) {
		stats[row.status as keyof typeof stats] = row.count
		stats.total += row.count
	}

	return stats
}

/**
 * Gets recent jobs for an entity.
 *
 * @param entityType - Entity type
 * @param entityId - Entity ID
 * @param limit - Maximum jobs to return
 * @returns Array of jobs
 */
export async function getJobsForEntity(
	entityType: MbEnrichmentEntityType,
	entityId: string,
	limit: number = 10
): Promise<MbEnrichmentJob[]> {
	const jobs = await db.query.mb_enrichment_jobs.findMany({
		where: (jobs, { eq, and }) =>
			and(eq(jobs.entity_type, entityType), eq(jobs.entity_id, entityId)),
		orderBy: (jobs, { desc }) => [desc(jobs.created_at)],
		limit,
	})
	return jobs as MbEnrichmentJob[]
}

