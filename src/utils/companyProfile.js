function hasText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function isCompanyProfileComplete(company) {
    if (!company) return false;

    return hasText(company.name) &&
        hasText(company.industry) &&
        hasText(company.location) &&
        hasText(company.description);
}

module.exports = {
    isCompanyProfileComplete,
};
