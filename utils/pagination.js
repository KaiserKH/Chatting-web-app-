function normalizePagination(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

function paginateArray(items, page, limit) {
  const total = items.length;
  const offset = (page - 1) * limit;
  return {
    items: items.slice(offset, offset + limit),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1
    }
  };
}

module.exports = {
  normalizePagination,
  paginateArray
};
