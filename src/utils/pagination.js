/**
 * Pagination helper — parses query params and returns Prisma-compatible pagination args.
 *
 * Usage in a controller:
 *   const { skip, take, page, limit } = paginate(req.query);
 *   const items = await prisma.job.findMany({ skip, take });
 */
const paginate = (query) => {
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 100);
    const skip = (page - 1) * limit;

    return { skip, take: limit, page, limit };
};

/**
 * Build pagination metadata for API responses.
 */
const paginationMeta = (total, page, limit) => ({
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasMore: page * limit < total,
});

module.exports = { paginate, paginationMeta };
