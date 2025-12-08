import { z } from "zod"

// Reusable Date Range
export const timeRangeSchema = z.object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
});

// Reusable Pagination
export const paginationSchema = z.object({
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(50),
});